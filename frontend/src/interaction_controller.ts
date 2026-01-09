import type { WidgetModel, LassoRequest } from "./model";
import { TRAITS } from "./model";
import type { createThreeScene } from "./three_scene";
import type { createControlBar } from "./ui";
import {
	setMode,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	cancelLasso,
	commitLasso,
	type InteractionState,
} from "./interaction";
import { pointerInfoFromEvent } from "./view";
import { uint8ArrayToBase64 } from "./binary";
import { dlog } from "./debug";

export type InteractionControllerDeps = {
	model: WidgetModel;
	three: ReturnType<typeof createThreeScene>;
	bar: ReturnType<typeof createControlBar>;
	state: InteractionState;

	root: HTMLElement;
	canvas: HTMLCanvasElement;

	syncUiFromState: () => void;
	signal: AbortSignal;

	transportReady: () => boolean;
	showMessage: (msg: string) => void;
	clearMessage: () => void;

	// Debug hooks for deterministic tests + real-world diagnosis
	debug?: {
		onCommitLasso?: (polyNdc: Array<{ x: number; y: number }>) => void;
		onIgnoreLasso?: (reason: string) => void;
		onSendLasso?: (payload: {
			op: "add" | "remove";
			label: string;
			request_id: number;
			maskBytes: number;
			polygonNdcPoints: number;
		}) => void;
	};
};

export function createInteractionController(deps: InteractionControllerDeps): {
	dispose: () => void;
} {
	const {
		model,
		three,
		bar,
		state,
		root,
		canvas,
		syncUiFromState,
		signal,
		transportReady,
		showMessage,
		clearMessage,
		debug,
	} = deps;

	// initial mode
	setMode(state, { kind: "rotate" });
	syncUiFromState();

	// toolbar buttons
	bar.rotateBtn.addEventListener(
		"click",
		() => {
			setMode(state, { kind: "rotate" });
			syncUiFromState();
		},
		{ signal },
	);

	bar.lassoBtn.addEventListener(
		"click",
		() => {
			// If comm/transport is not ready, do not enter lasso mode.
			if (!transportReady()) {
				showMessage(
					"Widget not interactive yet. Maybe you should run the cell to enable lasso.",
				);
				return;
			}

			clearMessage();
			setMode(state, { kind: "lasso", operation: "add" });
			syncUiFromState();
			root.focus();
		},
		{ signal },
	);

	bar.addBtn.addEventListener(
		"click",
		() => {
			if (state.mode.kind !== "lasso") return;
			setMode(state, { kind: "lasso", operation: "add" });
			syncUiFromState();
		},
		{ signal },
	);

	bar.removeBtn.addEventListener(
		"click",
		() => {
			if (state.mode.kind !== "lasso") return;
			setMode(state, { kind: "lasso", operation: "remove" });
			syncUiFromState();
		},
		{ signal },
	);

	// lasso commit protocol -> python
	let requestCounter = 1;

	function ignore(reason: string) {
		debug?.onIgnoreLasso?.(reason);
	}

	function sendCommittedLasso(polygonNdc: { x: number; y: number }[]) {
		if (state.mode.kind !== "lasso") {
			ignore("mode-not-lasso");
			return;
		}

		const label = bar.labelSelect.value;
		if (!label) {
			ignore("no-label-selected");
			return;
		}

		const op = state.mode.operation;
		const requestId = requestCounter++;

		// If selection is empty, there is nothing to send.
		const mask = three.selectMaskInLasso(polygonNdc);
		if (mask.length === 0) {
			ignore("empty-mask");
			return;
		}

		debug?.onCommitLasso?.(polygonNdc);
		debug?.onSendLasso?.({
			op,
			label,
			request_id: requestId,
			maskBytes: mask.length,
			polygonNdcPoints: polygonNdc.length,
		});

		model.set(TRAITS.lassoMask, uint8ArrayToBase64(mask));
		const req: LassoRequest = {
			kind: "lasso_commit",
			op,
			label,
			request_id: requestId,
		};
		model.set(TRAITS.lassoRequest, req);

		let ret: any;
		try {
			ret = model.save_changes() as any;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes("widget transport not ready")) {
				showMessage(
					"Widget not interactive yet. Maybe you should run the cell to enable lasso.",
				);
				ignore("transport-not-ready");
				return;
			}
			throw e; // unknown errors must remain loud
		}

		if (ret && typeof ret.then === "function") {
			ret.then(
				() => dlog("lasso", "[save_changes] ok", { request_id: requestId }),
				(err: unknown) =>
					dlog("lasso", "[save_changes] ERR", { request_id: requestId, err }),
			);
		} else {
			dlog("lasso", "[save_changes] non-promise return", {
				request_id: requestId,
				retType: typeof ret,
			});
		}
	}

	// focusable root for keyboard
	root.tabIndex = 0;

	// pointer events
	canvas.addEventListener(
		"pointerdown",
		(e) => {
			// 1) Hard guard: if layout isn't ready, ignore.
			// This is the real-world Marimo failure mode.
			if (state.pixelWidth <= 0 || state.pixelHeight <= 0 || state.dpr <= 0) {
				ignore("not-ready-size");
				return;
			}

			// 2) Only lasso mode handles pointerdown on overlay.
			if (state.mode.kind !== "lasso") {
				ignore("pointerdown-not-lasso");
				return;
			}

			// 3) Now it's safe to do rect-based computations.
			const p = pointerInfoFromEvent(e, canvas);
			if (!p.isInside) {
				ignore("pointerdown-outside");
				return;
			}

			root.focus();

			try {
				canvas.setPointerCapture(e.pointerId);
			} catch {
				// not fatal; don't spam ignore reasons in production if you want
				ignore("setPointerCapture-failed");
			}

			onPointerDown(state, p);
			e.preventDefault();
		},
		{ signal },
	);

	canvas.addEventListener(
		"pointermove",
		(e) => {
			const p = pointerInfoFromEvent(e, canvas);

			// Optional: if you want strict mode, only track move in lasso mode.
			// But for now, keep behavior and just record why it might be ignored.
			if (state.mode.kind !== "lasso") {
				ignore("pointermove-not-lasso");
				return;
			}

			onPointerMove(state, p);
		},
		{ signal },
	);

	canvas.addEventListener(
		"pointerup",
		(e) => {
			if (state.mode.kind !== "lasso") {
				ignore("pointerup-not-lasso");
				return;
			}

			onPointerUp(state);
			syncUiFromState();
			e.preventDefault();
		},
		{ signal },
	);

	canvas.addEventListener(
		"pointerleave",
		() => {
			state.lastPointer = null;
		},
		{ signal },
	);

	// keyboard
	root.addEventListener(
		"keydown",
		(e) => {
			if (e.key === "Escape") {
				cancelLasso(state);
				syncUiFromState();
				e.preventDefault();
			} else if (e.key === "Enter") {
				if (state.mode.kind !== "lasso") {
					ignore("enter-not-lasso");
					return;
				}

				const polygonNdc = commitLasso(state);
				if (!polygonNdc) {
					ignore("commit-returned-null");
				} else {
					sendCommittedLasso(polygonNdc);
				}

				syncUiFromState();
				e.preventDefault();
			}
		},
		{ signal },
	);

	return {
		dispose: () => {
			// DOM listeners removed by AbortController signal
		},
	};
}
