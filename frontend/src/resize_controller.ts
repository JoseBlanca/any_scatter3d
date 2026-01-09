// resize_controller.ts
import { observeSize } from "./view";
import type { createThreeScene } from "./three_scene";
import type { InteractionState } from "./interaction";

export type ResizeCanvasFn = (
	cssW: number,
	cssH: number,
) => { devicePixelRatio: number; width: number; height: number };

export type ResizeControllerDeps = {
	canvasHost: HTMLElement;
	three: ReturnType<typeof createThreeScene>;
	state: InteractionState;
	resizeCanvas: ResizeCanvasFn;

	resizeThresholdPx?: number;
	onFirstValidSize?: (cssW: number, cssH: number, dpr: number) => void;
};

export type ResizeController = {
	applyNow: () => void;
	dispose: () => void;
};

export function createResizeController(
	deps: ResizeControllerDeps,
): ResizeController {
	const {
		canvasHost,
		three,
		state,
		resizeCanvas,
		resizeThresholdPx = 2,
		onFirstValidSize,
	} = deps;

	let lastCssW = 0;
	let lastCssH = 0;
	let firedFirstValid = false;

	function apply(cssW: number, cssH: number) {
		const nextW = Math.max(0, Math.round(cssW));
		const nextH = Math.max(0, Math.round(cssH));
		if (nextW === 0 || nextH === 0) return;

		const isFirstValid = lastCssW === 0 || lastCssH === 0;

		// Jitter guard, but never block the first valid sizing
		if (
			!isFirstValid &&
			Math.abs(nextW - lastCssW) < resizeThresholdPx &&
			Math.abs(nextH - lastCssH) < resizeThresholdPx
		) {
			return;
		}

		lastCssW = nextW;
		lastCssH = nextH;

		const { devicePixelRatio, width, height } = resizeCanvas(nextW, nextH);

		state.dpr = devicePixelRatio;
		state.pixelWidth = width;
		state.pixelHeight = height;

		three.setSize(nextW, nextH, devicePixelRatio);

		if (!firedFirstValid) {
			firedFirstValid = true;
			onFirstValidSize?.(nextW, nextH, devicePixelRatio);
		}
	}

	function applyNow() {
		const r = canvasHost.getBoundingClientRect();
		apply(r.width, r.height);
	}

	const stopObserving = observeSize(canvasHost, (w, h) => apply(w, h));

	applyNow();

	return {
		applyNow,
		dispose: () => stopObserving(),
	};
}
