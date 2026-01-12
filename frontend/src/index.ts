import type { WidgetModel } from "./model";
import { TRAITS } from "./model";
import { createWidgetRoot, createOverlayCanvas, get2dContext } from "./view";
import { createInteractionState, drawOverlay, setMode } from "./interaction";
import { DEFAULT_UI_CONFIG } from "./ui_config";
import { createControlBar, renderControlBar } from "./ui";
import { createThreeScene } from "./three_scene";
import { bindModelToView } from "./model_bindings";
import { createTooltipController } from "./tooltip_controller";
import { createInteractionController } from "./interaction_controller";
import { createResizeController } from "./resize_controller";
import { createRafController } from "./raf_controller";
import { createTooltipView } from "./tooltip_view";
import { createLegendView } from "./legend_view";
import { createLegendController } from "./legend_controller";
import { makeDebugModel } from "./model_debug";
import type { ResizeCanvasFn } from "./resize_controller";
import { createTransportReadyController } from "./transport_ready";

export type WidgetHandles = {
	cleanup: () => void;
	forceResize: () => void;

	root: HTMLElement;
	canvasHost: HTMLElement;
	overlayCanvas: HTMLCanvasElement;

	debug: {
		boundPointerEvents: string[];
		modelChangeHandlers: string[];
		hostRect: { width: number; height: number };
		overlaySize: { width: number; height: number };
		stateSize: { dpr: number; pixelWidth: number; pixelHeight: number };
	};
};

function bindAndRecordPointer(
	debug: WidgetHandles["debug"],
	target: EventTarget,
	targetName: string,
	type: string,
	handler: (e: PointerEvent) => void,
	options?: boolean | AddEventListenerOptions,
) {
	const capture =
		typeof options === "boolean"
			? options
			: Boolean((options as AddEventListenerOptions | undefined)?.capture);

	target.addEventListener(type, handler as any, options as any);
	debug.boundPointerEvents.push(
		`${targetName}:${type}:${capture ? "capture" : "bubble"}`,
	);

	return () => target.removeEventListener(type, handler as any, options as any);
}

function isPromiseLike(x: unknown): x is PromiseLike<unknown> {
	return (
		typeof x === "object" &&
		x !== null &&
		"then" in x &&
		typeof (x as any).then === "function"
	);
}

export function buildWidget(
	model: WidgetModel,
	el: HTMLElement,
	opts?: { startRaf?: boolean },
): WidgetHandles {
	const debug: WidgetHandles["debug"] = {
		boundPointerEvents: [],
		modelChangeHandlers: [],
		hostRect: { width: 0, height: 0 },
		overlaySize: { width: 0, height: 0 },
		stateSize: { dpr: 0, pixelWidth: 0, pixelHeight: 0 },
	};

	// Use debug-wrapped model everywhere so we record registrations inside controllers/bindings.
	const dbgModel = makeDebugModel(model, debug);

	const { root, toolbar, tooltip, canvasHost } = createWidgetRoot(el);

	// --- 3D layer (three.js) ---
	const three = createThreeScene(canvasHost, dbgModel);
	three.domElement.style.position = "absolute";
	three.domElement.style.inset = "0";
	three.domElement.style.zIndex = "1"; // below overlay

	// --- 2D overlay canvas (lasso) ---
	const { canvas: overlayCanvas, resizeCanvas } =
		createOverlayCanvas(canvasHost);

	const resizeCanvasWithDebug: ResizeCanvasFn = (cssW, cssH) => {
		const ret = resizeCanvas(cssW, cssH);
		debug.stateSize = {
			dpr: ret.devicePixelRatio,
			pixelWidth: ret.width,
			pixelHeight: ret.height,
		};
		return ret;
	};

	const ctx = get2dContext(overlayCanvas);

	const state = createInteractionState();
	const abortController = new AbortController();

	// Pointer debug listeners (these are *yours*; controllers may also bind their own)
	function logPtr(label: string) {
		return (e: PointerEvent) => {
			const path = (e.composedPath?.() ?? []) as any[];
			const top = path[0] as HTMLElement | undefined;
		};
	}

	const disposers: Array<() => void> = [];

	const logCanvas = logPtr("overlay");
	const logThree = logPtr("three");

	// capture=true so you see events even if something stops propagation later
	for (const t of ["pointerdown", "pointermove", "pointerup"]) {
		disposers.push(
			bindAndRecordPointer(debug, overlayCanvas, "overlay", t, logCanvas, true),
		);
		disposers.push(
			bindAndRecordPointer(debug, three.domElement, "three", t, logThree, true),
		);
	}

	function logTopElement(tag: string) {
		const r = canvasHost.getBoundingClientRect();

		// pick a point inside the host rect, but clamp to viewport so elementFromPoint never returns null
		const vx0 = 0;
		const vy0 = 0;
		const vx1 = window.innerWidth - 1;
		const vy1 = window.innerHeight - 1;

		const cxRaw = r.left + r.width / 2;
		const cyRaw = r.top + r.height / 2;

		const cx = Math.min(vx1, Math.max(vx0, cxRaw));
		const cy = Math.min(vy1, Math.max(vy0, cyRaw));

		// jsdom (vitest) may not implement elementFromPoint; debug code must never crash startup.
		if (typeof document.elementFromPoint !== "function") {
			return;
		}
		const topEl = document.elementFromPoint(cx, cy) as HTMLElement | null;

		const three_dom = three.domElement;
		const overlay = overlayCanvas;

		const csTop = topEl ? window.getComputedStyle(topEl) : null;
		const csThree = window.getComputedStyle(three_dom);
		const csOverlay = window.getComputedStyle(overlay);
	}
	logTopElement("init");
	requestAnimationFrame(() => logTopElement("raf1"));

	// tooltip view
	const tooltipView = createTooltipView(tooltip);

	// --- UI ---
	const uiCfg = DEFAULT_UI_CONFIG;
	const bar = createControlBar(toolbar, uiCfg);

	function showMessage(msg: string) {
		bar.messageEl.textContent = msg;
		bar.messageEl.style.display = "";
	}

	function clearMessage() {
		bar.messageEl.textContent = "";
		bar.messageEl.style.display = "none";
	}

	const transport = createTransportReadyController(dbgModel);

	// Best-effort handshake attempt at startup (does nothing harmful if not ready).
	transport.announceClientReadyOnce();

	function transportReady(): boolean {
		// No TDZ risk: transport is already initialized.
		transport.announceClientReadyOnce();
		return transport.isReady();
	}

	// --- Legend ---
	const legendHost = document.createElement("div");
	legendHost.dataset.testid = "legend-host";
	toolbar.appendChild(legendHost);

	const legendView = createLegendView(legendHost, DEFAULT_UI_CONFIG);
	const legendController = createLegendController({
		model: dbgModel,
		view: legendView,
		transportReady,
	});

	// Initial render once traits are present
	legendController.refreshFromModel();

	function syncUiFromState() {
		const mode =
			dbgModel.get(TRAITS.interactionMode) === "lasso" ? "lasso" : "rotate";

		// Keep local state in sync (operation remains frontend-only)
		if (mode === "rotate") {
			setMode(state, { kind: "rotate" });
		} else {
			// preserve current operation if already lasso, default to add
			const op = state.mode.kind === "lasso" ? state.mode.operation : "add";
			setMode(state, { kind: "lasso", operation: op });
		}

		const uiState = {
			mode,
			operation: mode === "lasso" ? state.mode.operation : "add",
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
			overlayCanvas.style.pointerEvents = "none";
		} else {
			three.domElement.style.pointerEvents = "none";
			overlayCanvas.style.pointerEvents = "auto";
		}
	}

	const interactionController = createInteractionController({
		model: dbgModel,
		three,
		bar,
		state,
		root,
		canvas: overlayCanvas,
		syncUiFromState,
		signal: abortController.signal,
		transportReady,
		showMessage,
		clearMessage,

		// Debug hooks: must never crash production.
		debug: (globalThis as any).__scatter3d_test_debug ?? undefined,
	});

	const tooltipController = createTooltipController({
		model: dbgModel,
		three,
		threeCanvas: three.domElement,
		view: tooltipView,
		isLassoMode: () => state.mode.kind === "lasso",
		signal: abortController.signal,
	});

	const modelBindings = bindModelToView({
		model: dbgModel,
		three,
		refreshLegendUI: legendController.refreshFromModel,
		onTooltipResponseChange: tooltipController.onTooltipResponseChange,
	});

	dbgModel.set(TRAITS.clientReady, true);
	try {
		dbgModel.save_changes();
	} catch {
		/* do not crash render */
	}

	// Initial data push
	three.setPointsFromModel();
	three.setColorsFromModel();
	three.setSizesFromModel();
	three.setAxesFromModel();

	// Resize
	const resizeController = createResizeController({
		canvasHost,
		three,
		state,
		resizeCanvas: resizeCanvasWithDebug,
	});

	const forceResize = () => {
		resizeController.applyNow();
		debug.stateSize = {
			dpr: state.dpr,
			pixelWidth: state.pixelWidth,
			pixelHeight: state.pixelHeight,
		};
		syncUiFromState(); // ensure pointer routing matches mode after size changes
	};

	function ensureFirstLayoutReady() {
		const MAX_FRAMES = 60;
		let frames = 0;

		const tick = () => {
			frames += 1;
			resizeController.applyNow();

			const r = canvasHost.getBoundingClientRect();
			const ready =
				r.width > 0 &&
				r.height > 0 &&
				state.pixelWidth > 0 &&
				state.pixelHeight > 0 &&
				state.dpr > 0;

			if (ready) {
				// final, correct pointer routing after layout is real
				syncUiFromState();

				// record debug
				debug.hostRect = { width: r.width, height: r.height };
				debug.overlaySize = {
					width: overlayCanvas.width,
					height: overlayCanvas.height,
				};
				debug.stateSize = {
					dpr: state.dpr,
					pixelWidth: state.pixelWidth,
					pixelHeight: state.pixelHeight,
				};

				return;
			}

			if (frames < MAX_FRAMES) requestAnimationFrame(tick);
			else
				console.warn(
					"[scatter3d] never reached valid layout size on first render",
					{
						host: { w: r.width, h: r.height },
						state: {
							dpr: state.dpr,
							pw: state.pixelWidth,
							ph: state.pixelHeight,
						},
					},
				);
		};

		requestAnimationFrame(tick);
	}

	ensureFirstLayoutReady();

	// RAF loop: render 3D + overlay
	const raf = createRafController({
		onFrame: () => {
			three.render();
			drawOverlay(state, ctx);
		},
	});

	if (opts?.startRaf ?? false) {
		raf.start();
	}

	const cleanup = () => {
		// Stop frame loop first
		raf.stop();

		// Remove our debug listeners
		for (const d of disposers) d();

		// Abort controller-driven listeners (controllers should be listening to this)
		abortController.abort();

		// Dispose in roughly reverse creation order
		legendController.dispose();
		legendView.dispose();
		legendHost.remove();
		modelBindings.dispose();
		interactionController.dispose();
		tooltipController.dispose();
		resizeController.dispose();
		three.dispose();
		transport.dispose();

		// Remove overlay canvas from DOM
		overlayCanvas.remove();
	};

	return {
		cleanup,
		forceResize,
		root,
		canvasHost,
		overlayCanvas,
		debug,
	};
}

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	const cleanupPrev = (el as any).__any_scatter3d_cleanup as
		| undefined
		| (() => void);
	cleanupPrev?.();

	const handles = buildWidget(model, el, { startRaf: true });
	(el as any).__any_scatter3d_cleanup = handles.cleanup;
}

export default { render };
