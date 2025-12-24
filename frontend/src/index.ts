import type { WidgetModel } from "./model";
import {
	createWidgetRoot,
	observeSize,
	createCanvas,
	pointerInfoFromEvent,
	get2dContext,
} from "./view";
import {
	createInteractionState,
	setMode,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	cancelLasso,
	commitLasso,
	drawOverlay,
} from "./interaction";
import { createControlBar, renderControlBar, DEFAULT_UI_CONFIG } from "./ui";

const RESIZE_THRESHOLD_PX = 2;

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	const cleanupPrev = (el as any).__any_scatter3d_cleanup as
		| undefined
		| (() => void);
	cleanupPrev?.();

	const { root, toolbar, canvasHost } = createWidgetRoot(el);

	const abortController = new AbortController();

	// Canvas + interaction state
	const { canvas, resizeCanvas } = createCanvas(canvasHost);
	const ctx = get2dContext(canvas);
	const state = createInteractionState();

	const uiCfg = DEFAULT_UI_CONFIG;
	const bar = createControlBar(toolbar, uiCfg);

	// initial UI state from interaction state
	function syncUiFromState() {
		const uiState = {
			mode: state.mode.kind,
			operation: state.mode.kind === "lasso" ? state.mode.operation : "add",
		} as const;
		renderControlBar(bar, uiCfg, uiState);
	}

	// initial mode
	setMode(state, { kind: "rotate" });
	syncUiFromState();

	bar.rotateBtn.addEventListener(
		"click",
		() => {
			setMode(state, { kind: "rotate" });
			syncUiFromState();
		},
		{ signal: abortController.signal },
	);

	bar.lassoBtn.addEventListener(
		"click",
		() => {
			setMode(state, { kind: "lasso", operation: "add" });
			syncUiFromState();
		},
		{ signal: abortController.signal },
	);

	bar.addBtn.addEventListener(
		"click",
		() => {
			if (state.mode.kind !== "lasso") return;
			setMode(state, { kind: "lasso", operation: "add" });
			syncUiFromState();
		},
		{ signal: abortController.signal },
	);

	bar.removeBtn.addEventListener(
		"click",
		() => {
			if (state.mode.kind !== "lasso") return;
			setMode(state, { kind: "lasso", operation: "remove" });
			syncUiFromState();
		},
		{ signal: abortController.signal },
	);
	bar.categorySelect.innerHTML = "";
	for (const name of ["country", "species"]) {
		const opt = document.createElement("option");
		opt.value = name;
		opt.textContent = name;
		bar.categorySelect.appendChild(opt);
	}

	bar.valueSelect.innerHTML = "";
	for (const v of ["Spain", "Italy"]) {
		const opt = document.createElement("option");
		opt.value = v;
		opt.textContent = v;
		bar.valueSelect.appendChild(opt);
	}

	// Make root focusable so Enter/Escape works
	root.tabIndex = 0;

	// Pointer events
	canvas.addEventListener(
		"pointerdown",
		(e) => {
			const p = pointerInfoFromEvent(e, canvas);
			if (!p.isInside) return;

			// In lasso mode, start lasso and focus root for keyboard confirm/cancel
			if (state.mode.kind === "lasso") {
				root.focus();
				canvas.setPointerCapture(e.pointerId);
				onPointerDown(state, p);
				e.preventDefault();
			}
		},
		{ signal: abortController.signal },
	);

	canvas.addEventListener(
		"pointermove",
		(e) => {
			const p = pointerInfoFromEvent(e, canvas);
			onPointerMove(state, p);
		},
		{ signal: abortController.signal },
	);

	canvas.addEventListener(
		"pointerup",
		(e) => {
			if (state.mode.kind !== "lasso") return;
			onPointerUp(state);
			syncUiFromState();
			e.preventDefault();
		},
		{ signal: abortController.signal },
	);

	canvas.addEventListener(
		"pointerleave",
		() => {
			state.lastPointer = null;
		},
		{ signal: abortController.signal },
	);

	// Keyboard: commit/cancel
	root.addEventListener(
		"keydown",
		(e) => {
			if (e.key === "Escape") {
				cancelLasso(state);
				syncUiFromState();
				e.preventDefault();
			} else if (e.key === "Enter") {
				commitLasso(state);
				syncUiFromState();
				e.preventDefault();
			}
		},
		{ signal: abortController.signal },
	);

	// Resize
	let lastWidth = 0;
	let lastHeight = 0;

	const stopObserving = observeSize(canvasHost, (canvasWidth, canvasHeight) => {
		const cssW = Math.round(canvasWidth);
		const cssH = Math.round(canvasHeight);

		if (
			Math.abs(cssW - lastWidth) < RESIZE_THRESHOLD_PX &&
			Math.abs(cssH - lastHeight) < RESIZE_THRESHOLD_PX
		) {
			return;
		}
		lastWidth = cssW;
		lastHeight = cssH;

		const { devicePixelRatio, width, height } = resizeCanvas(cssW, cssH);
		state.dpr = devicePixelRatio;
		state.pixelWidth = width;
		state.pixelHeight = height;
	});

	// RAF loop: draw overlay (later: render 3D + overlay)
	let rafId = 0;
	const frame = () => {
		drawOverlay(state, ctx);
		rafId = requestAnimationFrame(frame);
	};
	rafId = requestAnimationFrame(frame);

	// TEMP: set mode manually for now (later you’ll add UI controls)
	// setMode(state, { kind: "lasso", op: "add" });

	const cleanup = () => {
		abortController.abort();
		stopObserving();
		cancelAnimationFrame(rafId);
		canvas.remove();
	};
	(el as any).__any_scatter3d_cleanup = cleanup;
}

export default { render };
