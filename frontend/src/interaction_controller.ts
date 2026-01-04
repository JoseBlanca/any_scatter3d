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

export type InteractionControllerDeps = {
	model: WidgetModel;
	three: ReturnType<typeof createThreeScene>;
	bar: ReturnType<typeof createControlBar>;
	state: InteractionState;

	root: HTMLElement;
	canvas: HTMLCanvasElement;

	// implement this in index.ts since it touches DOM styling
	syncUiFromState: () => void;

	signal: AbortSignal;
};

export function createInteractionController(deps: InteractionControllerDeps): {
	dispose: () => void;
} {
	const { model, three, bar, state, root, canvas, syncUiFromState, signal } =
		deps;

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
			setMode(state, { kind: "lasso", operation: "add" });
			syncUiFromState();
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

	function sendCommittedLasso(polygonNdc: { x: number; y: number }[]) {
		if (state.mode.kind !== "lasso") return;

		const label = bar.labelSelect.value;
		if (!label) return;

		const op = state.mode.operation;
		const requestId = requestCounter++;
		const mask = three.selectMaskInLasso(polygonNdc);
		if (mask.length === 0) return;

		model.set(TRAITS.lassoMask, uint8ArrayToBase64(mask));
		const req: LassoRequest = {
			kind: "lasso_commit",
			op,
			label,
			request_id: requestId,
		};
		model.set(TRAITS.lassoRequest, req);
		model.save_changes();
	}

	// focusable root for keyboard
	root.tabIndex = 0;

	// pointer events
	canvas.addEventListener(
		"pointerdown",
		(e) => {
			const p = pointerInfoFromEvent(e, canvas);
			if (!p.isInside) return;

			if (state.mode.kind === "lasso") {
				root.focus();
				canvas.setPointerCapture(e.pointerId);
				onPointerDown(state, p);
				e.preventDefault();
			}
		},
		{ signal },
	);

	canvas.addEventListener(
		"pointermove",
		(e) => {
			const p = pointerInfoFromEvent(e, canvas);
			onPointerMove(state, p);
		},
		{ signal },
	);

	canvas.addEventListener(
		"pointerup",
		(e) => {
			if (state.mode.kind !== "lasso") return;
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
				const polygonNdc = commitLasso(state);
				if (polygonNdc) sendCommittedLasso(polygonNdc);
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
