import type { WidgetModel, LassoRequest, LassoResult } from "./model";
import { TRAITS } from "./model";
import {
	createWidgetRoot,
	observeSize,
	createOverlayCanvas,
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
	type InteractionState,
} from "./interaction";
import { createControlBar, renderControlBar, DEFAULT_UI_CONFIG } from "./ui";
import { createThreeScene } from "./three_scene";
import { uint8ArrayToBase64 } from "./binary";

const RESIZE_THRESHOLD_PX = 2;

function populateLabelSelect(
	select: HTMLSelectElement,
	labels: string[],
	preferred?: string,
) {
	select.innerHTML = "";

	for (const label of labels) {
		const opt = document.createElement("option");
		opt.value = label;
		opt.textContent = label;
		select.appendChild(opt);
	}

	if (select.options.length === 0) return;

	if (
		preferred &&
		Array.from(select.options).some((o) => o.value === preferred)
	) {
		select.value = preferred;
	} else {
		select.selectedIndex = 0;
	}
}

function getLabelsFromModel(model: WidgetModel): string[] {
	const x = model.get(TRAITS.labels);
	if (!Array.isArray(x)) return [];
	return x.map((v) => String(v));
}

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	const cleanupPrev = (el as any).__any_scatter3d_cleanup as
		| undefined
		| (() => void);
	cleanupPrev?.();

	const { root, toolbar, canvasHost } = createWidgetRoot(el);

	const abortController = new AbortController();

	// --- 3D layer (three.js) ---
	const three = createThreeScene(canvasHost, model);
	three.domElement.style.position = "absolute";
	three.domElement.style.inset = "0";
	three.domElement.style.zIndex = "1"; // below overlay

	// Initial data push
	three.setPointsFromModel();
	three.setColorsFromModel();

	// --- 2D overlay canvas (lasso) ---
	const { canvas, resizeCanvas } = createOverlayCanvas(canvasHost);
	const ctx = get2dContext(canvas);

	const state = createInteractionState();

	// Initial sizing
	{
		const r = canvasHost.getBoundingClientRect();
		const cssW = Math.round(r.width);
		const cssH = Math.round(r.height);
		if (cssW > 0 && cssH > 0) {
			const { devicePixelRatio, width, height } = resizeCanvas(cssW, cssH);
			state.dpr = devicePixelRatio;
			state.pixelWidth = width;
			state.pixelHeight = height;
			three.setSize(cssW, cssH, devicePixelRatio);
		}
	}

	// --- UI ---
	const uiCfg = DEFAULT_UI_CONFIG;
	const bar = createControlBar(toolbar, uiCfg);

	function syncUiFromState() {
		const uiState = {
			mode: state.mode.kind,
			operation: state.mode.kind === "lasso" ? state.mode.operation : "add",
		} as const;

		renderControlBar(bar, uiCfg, uiState);

		// Pointer routing:
		// - Rotate: interact with three.js canvas (OrbitControls)
		// - Lasso: interact with overlay canvas
		if (uiState.mode === "rotate") {
			three.domElement.style.pointerEvents = "auto";
			canvas.style.pointerEvents = "none";
		} else {
			three.domElement.style.pointerEvents = "none";
			canvas.style.pointerEvents = "auto";
		}
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

	function refreshLabelsUI() {
		const labels = getLabelsFromModel(model);
		const prev = bar.labelSelect.value;
		populateLabelSelect(bar.labelSelect, labels, prev);
	}

	// initial labels
	refreshLabelsUI();

	// -----------------------
	// Lasso commit -> Python
	// -----------------------
	let requestCounter = 1;

	function sendCommittedLasso(args: {
		model: WidgetModel;
		three: ReturnType<typeof createThreeScene>;
		bar: typeof bar;
		state: InteractionState;
		polygonNdc: { x: number; y: number }[];
	}) {
		const { model, three, bar, state, polygonNdc } = args;

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

	// -----------------------
	// Model -> view updates
	// -----------------------

	const onXYZChange = () => {
		three.setPointsFromModel();
		// points changed implies we should recolor too
		three.setColorsFromModel();
	};

	const onColorsRelatedChange = () => {
		// coded_values_t or palette changed
		three.setColorsFromModel();
	};

	const onLabelsChange = () => {
		refreshLabelsUI();
		// labels affect mapping code->color index; recolor defensively
		three.setColorsFromModel();
	};

	const onLassoResultChange = () => {
		const res = model.get(TRAITS.lassoResult) as LassoResult | unknown;
		if (!res || typeof res !== "object") return;
		const status = (res as any).status;
		if (status === "error") {
			// Hard visible signal: console + could add a toast later
			// Important: don't swallow this silently.
			console.error("Lasso error:", (res as any).message ?? res);
		}
	};

	model.on(`change:${TRAITS.xyzBytes}`, onXYZChange);
	model.on(`change:${TRAITS.codedValues}`, onColorsRelatedChange);
	model.on(`change:${TRAITS.colors}`, onColorsRelatedChange);
	model.on(`change:${TRAITS.missingColor}`, onColorsRelatedChange);
	model.on(`change:${TRAITS.labels}`, onLabelsChange);
	model.on(`change:${TRAITS.lassoResult}`, onLassoResultChange);

	// Make root focusable so Enter/Escape works
	root.tabIndex = 0;

	// Pointer events (overlay canvas in lasso mode)
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
				const polygonNdc = commitLasso(state);
				if (polygonNdc) {
					sendCommittedLasso({
						model,
						three,
						bar,
						state,
						polygonNdc,
					});
				}
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

		three.setSize(cssW, cssH, devicePixelRatio);
	});

	// RAF loop: render 3D + overlay
	let rafId = 0;
	const frame = () => {
		three.render();
		drawOverlay(state, ctx);
		rafId = requestAnimationFrame(frame);
	};
	rafId = requestAnimationFrame(frame);

	const cleanup = () => {
		abortController.abort();

		model.off(`change:${TRAITS.xyzBytes}`, onXYZChange);
		model.off(`change:${TRAITS.codedValues}`, onColorsRelatedChange);
		model.off(`change:${TRAITS.colors}`, onColorsRelatedChange);
		model.off(`change:${TRAITS.missingColor}`, onColorsRelatedChange);
		model.off(`change:${TRAITS.labels}`, onLabelsChange);
		model.off(`change:${TRAITS.lassoResult}`, onLassoResultChange);

		stopObserving();
		cancelAnimationFrame(rafId);
		three.dispose();
		canvas.remove();
	};

	(el as any).__any_scatter3d_cleanup = cleanup;
}

export default { render };
