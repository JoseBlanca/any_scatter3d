import type { WidgetModel } from "./model";
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
	LassoPoint,
	InteractionState,
} from "./interaction";
import { createControlBar, renderControlBar, DEFAULT_UI_CONFIG } from "./ui";
import { createThreeScene } from "./three_scene";
import { bytesToUint8Array } from "./binary";

const RESIZE_THRESHOLD_PX = 2;

type LabelsForCategories = Record<string, string[]>;
type CodedCategories = Record<string, unknown>; // values are "bytes-like"
type CategoriesColors = Record<string, number[][]>; // list of [r,g,b]

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	const cleanupPrev = (el as any).__any_scatter3d_cleanup as
		| undefined
		| (() => void);
	cleanupPrev?.();

	const { root, toolbar, canvasHost } = createWidgetRoot(el);

	const abortController = new AbortController();

	// Canvas + interaction state
	// --- 3D layer (three.js) ---
	const three = createThreeScene(canvasHost, model);
	three.domElement.style.position = "absolute";
	three.domElement.style.inset = "0";
	three.domElement.style.zIndex = "1"; // below overlay
	three.setPointsFromModel();
	three.setPointSizeFromModel();

	// --- 2D overlay canvas (lasso) ---
	const { canvas, resizeCanvas } = createOverlayCanvas(canvasHost);
	const ctx = get2dContext(canvas);

	const state = createInteractionState();

	const r = canvasHost.getBoundingClientRect();
	if (r.width > 0 && r.height > 0) {
		three.setSize(
			Math.round(r.width),
			Math.round(r.height),
			window.devicePixelRatio || 1,
		);
	}
	const cssW = Math.round(r.width);
	const cssH = Math.round(r.height);
	if (cssW > 0 && cssH > 0) {
		const { devicePixelRatio, width, height } = resizeCanvas(cssW, cssH);
		state.dpr = devicePixelRatio;
		state.pixelWidth = width;
		state.pixelHeight = height;
		three.setSize(cssW, cssH, devicePixelRatio);
	}

	three.setPointsFromModel();
	three.setPointSizeFromModel();

	const uiCfg = DEFAULT_UI_CONFIG;
	const bar = createControlBar(toolbar, uiCfg);

	// initial UI state from interaction state
	function syncUiFromState() {
		const uiState = {
			mode: state.mode.kind,
			operation: state.mode.kind === "lasso" ? state.mode.operation : "add",
		} as const;
		renderControlBar(bar, uiCfg, uiState);

		// Pointer routing:
		// - Rotate: interact with three.js canvas (OrbitControls)
		// - Lasso: interact with overlay canvas (your lasso code)
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

	const labelsForCategories =
		(model.get("labels_for_categories_t") as LabelsForCategories) ?? {};
	function getLabelsForCategories(): LabelsForCategories {
		return (model.get("labels_for_categories_t") as LabelsForCategories) ?? {};
	}

	function populateCategorySelect(
		select: HTMLSelectElement,
		labelsForCategories: Record<string, string[]>,
		preferred?: string,
	) {
		const categories = Object.keys(labelsForCategories).sort();

		select.innerHTML = "";
		for (const category of categories) {
			const opt = document.createElement("option");
			opt.value = category;
			opt.textContent = category;
			select.appendChild(opt);
		}

		// Pick a valid selection
		if (categories.length === 0) return;

		const wanted =
			preferred && categories.includes(preferred) ? preferred : categories[0];
		select.value = wanted;
	}

	function populateValueSelect(
		select: HTMLSelectElement,
		category: string,
		labelsForCategories: Record<string, string[]>,
		preferredCode?: string,
	) {
		select.innerHTML = "";
		const labels = labelsForCategories[category];
		if (!labels) return;

		for (let i = 2; i < labels.length; i++) {
			const opt = document.createElement("option");
			opt.value = String(i); // code
			opt.textContent = labels[i]; // label
			select.appendChild(opt);
		}

		// Keep previous value if still valid; otherwise default to first option
		if (select.options.length === 0) return;
		if (
			preferredCode &&
			Array.from(select.options).some((o) => o.value === preferredCode)
		) {
			select.value = preferredCode;
		} else {
			select.selectedIndex = 0;
		}
	}

	function refreshCategoriesUI() {
		const labelsForCategories =
			(model.get("labels_for_categories_t") as Record<string, string[]>) ?? {};

		const prevCategory = bar.categorySelect.value;
		const prevValueCode = bar.valueSelect.value;

		populateCategorySelect(
			bar.categorySelect,
			labelsForCategories,
			prevCategory,
		);
		populateValueSelect(
			bar.valueSelect,
			bar.categorySelect.value,
			labelsForCategories,
			prevValueCode,
		);
	}
	bar.categorySelect.addEventListener(
		"change",
		() => {
			const labelsForCategories = getLabelsForCategories();
			populateValueSelect(
				bar.valueSelect,
				bar.categorySelect.value,
				labelsForCategories,
			);
			applyColorsFromSelectedCategory();
		},
		{ signal: abortController.signal },
	);

	function applyColorsFromSelectedCategory() {
		const category = bar.categorySelect.value;
		if (!category) return;

		const coded = (model.get("coded_categories_t") as CodedCategories) ?? {};
		const palettes =
			(model.get("categories_colors_t") as CategoriesColors) ?? {};

		const codesBytes = coded[category];
		const colorsForCodes = palettes[category];

		if (!codesBytes || !colorsForCodes) return;

		three.setColorsFromCategory(codesBytes, colorsForCodes);
	}
	refreshCategoriesUI();
	applyColorsFromSelectedCategory();

	const category = bar.categorySelect.value;

	function applyCommittedLasso(args: {
		model: import("./model").WidgetModel;
		three: import("./three_scene").ThreeScene;
		bar: any; // your UI object with dropdowns
		state: InteractionState;
		polygon: LassoPoint[];
	}) {
		const { model, three, bar, state, polygon } = args;

		// Column (e.g. "country") and label (e.g. "Spain")
		const categoryCol = bar.categorySelect.value;
		const codeStr = bar.valueSelect.value;
		if (!categoryCol || !codeStr) return;

		const codedAll = (model.get("coded_categories_t") ?? {}) as Record<
			string,
			unknown
		>;
		const labelsAll = (model.get("labels_for_categories_t") ?? {}) as Record<
			string,
			string[]
		>;
		const palettesAll = (model.get("categories_colors_t") ?? {}) as Record<
			string,
			number[][]
		>;

		const codesBytesRaw = codedAll[categoryCol];
		const labels = labelsAll[categoryCol];
		const colorsForCodes = palettesAll[categoryCol];

		if (!codesBytesRaw || !labels || !colorsForCodes) return;

		// You are currently interpreting codes as Uint32Array in three_scene.ts:
		//   const codes = new Uint32Array(bytesToUint8Array(codesBytes).buffer);
		// so we must mutate as Uint32, not Uint8.
		const u8 = bytesToUint8Array(codesBytesRaw);
		const codes = u8;

		const targetCode = Number.parseInt(codeStr, 10);
		if (!Number.isFinite(targetCode)) return;

		const unassignedCode = 0;

		// polygon points are already in NDC in your InteractionState
		const polyNdc = polygon.map((p) => ({
			x: p.normDevCoordX,
			y: p.normDevCoordY,
		}));

		const indices = three.selectIndicesInLasso(polyNdc);
		if (indices.length === 0) return;

		let changed = false;
		const op = state.mode.kind === "lasso" ? state.mode.operation : null;
		if (!op) return;

		if (op === "add") {
			for (const idx of indices) {
				if (codes[idx] !== targetCode) {
					codes[idx] = targetCode;
					changed = true;
				}
			}
		} else {
			for (const idx of indices) {
				if (codes[idx] === targetCode) {
					codes[idx] = unassignedCode;
					changed = true;
				}
			}
		}

		if (!changed) return;

		// Recolor immediately (local)
		three.setColorsFromCategory(u8, colorsForCodes);

		// Commit to Python once per lasso end.
		const u8copy = new Uint8Array(u8); // copy to avoid sharing the same backing store

		// IMPORTANT: slice to an exact-length ArrayBuffer (no extra capacity)
		const buf = u8copy.buffer.slice(
			u8copy.byteOffset,
			u8copy.byteOffset + u8copy.byteLength,
		);

		// Wrap in DataView to strongly signal “binary” to serializers
		const payload = new DataView(buf);

		model.set("coded_categories_t", { ...codedAll, [categoryCol]: payload });
		model.save_changes();
	}

	const onPointsChange = () => three.setPointsFromModel();
	const onPointSizeChange = () => three.setPointSizeFromModel();
	const onPointsDtypeChange = () => three.setPointsFromModel();
	const onPointsStrideChange = () => three.setPointsFromModel();
	const onLabelsChange = () => {
		refreshCategoriesUI();
		applyColorsFromSelectedCategory();
	};
	const onCodedCategoriesChange = () => applyColorsFromSelectedCategory();
	const onCategoriesColorsChange = () => applyColorsFromSelectedCategory();

	model.on("change:points_t", onPointsChange);
	model.on("change:point_size_t", onPointSizeChange);
	model.on("change:points_dtype_t", onPointsDtypeChange);
	model.on("change:points_stride_t", onPointsStrideChange);
	model.on("change:labels_for_categories_t", onLabelsChange);
	model.on("change:coded_categories_t", onCodedCategoriesChange);
	model.on("change:categories_colors_t", onCategoriesColorsChange);

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
				const polygon = commitLasso(state);
				if (polygon) {
					applyCommittedLasso({ model, three, bar, state, polygon });
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

	// RAF loop: draw overlay (later: render 3D + overlay)
	let rafId = 0;
	const frame = () => {
		three.render();
		drawOverlay(state, ctx);
		rafId = requestAnimationFrame(frame);
	};
	rafId = requestAnimationFrame(frame);

	// TEMP: set mode manually for now (later you’ll add UI controls)
	// setMode(state, { kind: "lasso", op: "add" });

	const cleanup = () => {
		abortController.abort();

		model.off("change:points_t", onPointsChange);
		model.off("change:point_size_t", onPointSizeChange);
		model.off("change:points_dtype_t", onPointsDtypeChange);
		model.off("change:points_stride_t", onPointsStrideChange);
		model.off("change:labels_for_categories_t", onLabelsChange);
		model.off("change:coded_categories_t", onCodedCategoriesChange);
		model.off("change:categories_colors_t", onCategoriesColorsChange);

		stopObserving();
		cancelAnimationFrame(rafId);
		three.dispose();
		canvas.remove();
	};
	(el as any).__any_scatter3d_cleanup = cleanup;
}

export default { render };
