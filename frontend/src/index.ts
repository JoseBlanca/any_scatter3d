import type { WidgetModel } from "./model";
import { createWidgetRoot, createOverlayCanvas, get2dContext } from "./view";
import { createInteractionState, drawOverlay } from "./interaction";
import { createControlBar, renderControlBar, DEFAULT_UI_CONFIG } from "./ui";
import { createThreeScene } from "./three_scene";
import { bindModelToView } from "./model_bindings";
import { createTooltipController } from "./tooltip_controller";
import { createInteractionController } from "./interaction_controller";
import { createResizeController } from "./resize_controller";
import { createRafController } from "./raf_controller";
import { createLabelsController } from "./labels_controller";

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	const cleanupPrev = (el as any).__any_scatter3d_cleanup as
		| undefined
		| (() => void);
	cleanupPrev?.();

	const { root, toolbar, tooltip, canvasHost } = createWidgetRoot(el);

	const abortController = new AbortController();

	// --- 3D layer (three.js) ---
	const three = createThreeScene(canvasHost, model);
	three.domElement.style.position = "absolute";
	three.domElement.style.inset = "0";
	three.domElement.style.zIndex = "1"; // below overlay

	// --- 2D overlay canvas (lasso) ---
	const { canvas, resizeCanvas } = createOverlayCanvas(canvasHost);
	const ctx = get2dContext(canvas);

	const state = createInteractionState();

	// tooltip
	function hideTooltip() {
		tooltip.style.display = "none";
	}

	function positionTooltip(cssX: number, cssY: number) {
		tooltip.style.left = `${cssX + 10}px`;
		tooltip.style.top = `${cssY + 10}px`;
		tooltip.style.display = "block";
	}

	function clearTooltip() {
		tooltip.replaceChildren();
	}

	function showLoadingAt(cssX: number, cssY: number) {
		clearTooltip();
		tooltip.textContent = "Loading…";
		positionTooltip(cssX, cssY);
	}

	function showErrorAt(cssX: number, cssY: number, message: string) {
		clearTooltip();
		tooltip.textContent = `Error: ${message}`;
		positionTooltip(cssX, cssY);
	}

	function showAt(cssX: number, cssY: number, rows: Array<[string, string]>) {
		clearTooltip();

		for (const [k, v] of rows) {
			const row = document.createElement("div");

			const b = document.createElement("b");
			b.textContent = k;

			row.appendChild(b);
			row.append(`: ${v}`);

			tooltip.appendChild(row);
		}

		positionTooltip(cssX, cssY);
	}

	const tooltipView = {
		hide: hideTooltip,
		showAt,
		showLoadingAt,
		showErrorAt,
	};

	// --- UI ---
	const uiCfg = DEFAULT_UI_CONFIG;
	const bar = createControlBar(toolbar, uiCfg);

	const labelsController = createLabelsController({
		model,
		select: bar.labelSelect,
	});

	function syncUiFromState() {
		const uiState = {
			mode: state.mode.kind,
			operation: state.mode.kind === "lasso" ? state.mode.operation : "add",
		} as const;

		renderControlBar(bar, uiCfg, uiState);

		if (uiState.mode === "lasso") {
			tooltipView.hide();
		}
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

	const interactionController = createInteractionController({
		model,
		three,
		bar,
		state,
		root,
		canvas,
		syncUiFromState,
		signal: abortController.signal,
	});

	const tooltipController = createTooltipController({
		model,
		three,
		threeCanvas: three.domElement,
		view: tooltipView,
		isLassoMode: () => state.mode.kind === "lasso",
		signal: abortController.signal,
	});

	const modelBindings = bindModelToView({
		model,
		three,
		refreshLabelsUI: labelsController.refresh,
		onTooltipResponseChange: tooltipController.onTooltipResponseChange,
	});

	// Initial data push
	three.setPointsFromModel();
	three.setColorsFromModel();
	three.setAxesFromModel();

	// Initial labels
	labelsController.refresh();

	// Resize
	const resizeController = createResizeController({
		canvasHost,
		three,
		state,
		resizeCanvas,
	});

	// RAF loop: render 3D + overlay
	const raf = createRafController({
		onFrame: () => {
			three.render();
			drawOverlay(state, ctx);
		},
	});
	raf.start();

	const cleanup = () => {
		raf.stop();
		abortController.abort();
		modelBindings.dispose();
		interactionController.dispose();
		tooltipController.dispose();
		resizeController.dispose();
		three.dispose();
		canvas.remove();
	};

	(el as any).__any_scatter3d_cleanup = cleanup;
}

export default { render };
