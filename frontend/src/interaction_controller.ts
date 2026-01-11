import type { WidgetModel, LassoRequest, LassoOp } from "./model";
import { TRAITS } from "./model";
import type { ThreeScene } from "./three_scene";
import type { ControlBar } from "./ui";
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
import { dlog } from "./debug";

export type InteractionControllerDeps = {
	model: WidgetModel;
	three: ThreeScene;
	bar: ControlBar;
	state: InteractionState;

	root: HTMLElement;
	canvas: HTMLCanvasElement;

	syncUiFromState: () => void;
	signal: AbortSignal;

	transportReady: () => boolean;
	showMessage: (msg: string) => void;
	clearMessage: () => void;

	debug?: {
		onCommitLasso?: (polyNdc: Array<{ x: number; y: number }>) => void;
		onIgnoreLasso?: (reason: string) => void;
		onSendLasso?: (payload: {
			op: LassoOp;
			label: string;
			request_id: number;
			maskBytes: number;
			polygonNdcPoints: number;
		}) => void;
	};
};

function isPromiseLike(x: unknown): x is PromiseLike<unknown> {
	return (
		typeof x === "object" &&
		x !== null &&
		"then" in x &&
		typeof (x as any).then === "function"
	);
}

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
			model.set(TRAITS.interactionMode, "rotate");
			model.save_changes();
		},
		{ signal },
	);

	bar.lassoBtn.addEventListener(
		"click",
		() => {
			if (!transportReady()) {
				showMessage(
					"Widget not interactive yet. Maybe you should run the cell to enable lasso.",
				);
				return;
			}

			clearMessage();

			// Keep Python authoritative: set the trait.
			model.set(TRAITS.interactionMode, "lasso");
			model.save_changes();

			// Local state follows the model (op remains frontend-only)
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

		const label = model.get(TRAITS.activeCategory);
		if (typeof label !== "string" || label.length === 0) {
			throw new Error(
				"Invariant violation: lasso commit with empty active_category_t",
			);
		}

		const op = state.mode.operation;
		const requestId = requestCounter++;

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

		// Send Bytes as DataView so the widget protocol treats it as binary, not JSON.
		const dv = new DataView(
			mask.buffer.slice(mask.byteOffset, mask.byteOffset + mask.byteLength),
		);
		model.set(TRAITS.lassoMask, dv);

		const req: LassoRequest = {
			kind: "lasso_commit",
			op,
			label,
			request_id: requestId,
		};
		model.set(TRAITS.lassoRequest, req);

		let ret: unknown;
		try {
			ret = model.save_changes();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes("widget transport not ready")) {
				showMessage(
					"Widget not interactive yet. Maybe you should run the cell to enable lasso.",
				);
				ignore("transport-not-ready");
				return;
			}
			throw e;
		}

		if (isPromiseLike(ret)) {
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
			// This guard only works if you initialize the state to 0s
			// (we'll fix that in interaction.ts next).
			if (state.pixelWidth <= 0 || state.pixelHeight <= 0 || state.dpr <= 0) {
				ignore("not-ready-size");
				return;
			}

			if (state.mode.kind !== "lasso") {
				ignore("pointerdown-not-lasso");
				return;
			}

			const p = pointerInfoFromEvent(e, canvas);
			if (!p.isInside) {
				ignore("pointerdown-outside");
				return;
			}

			root.focus();

			try {
				canvas.setPointerCapture(e.pointerId);
			} catch {
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
				return;
			}

			if (e.key === "Enter") {
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
