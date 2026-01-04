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

	// avoid thrashing during tiny layout jitter
	resizeThresholdPx?: number;
};

export function createResizeController(deps: ResizeControllerDeps): {
	dispose: () => void;
} {
	const {
		canvasHost,
		three,
		state,
		resizeCanvas,
		resizeThresholdPx = 2,
	} = deps;

	let lastWidth = 0;
	let lastHeight = 0;

	const stopObserving = observeSize(canvasHost, (canvasWidth, canvasHeight) => {
		const cssW = Math.round(canvasWidth);
		const cssH = Math.round(canvasHeight);

		if (
			Math.abs(cssW - lastWidth) < resizeThresholdPx &&
			Math.abs(cssH - lastHeight) < resizeThresholdPx
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

	const r = canvasHost.getBoundingClientRect();
	const cssW = Math.round(r.width);
	const cssH = Math.round(r.height);
	if (cssW > 0 && cssH > 0) {
		const { devicePixelRatio, width, height } = resizeCanvas(cssW, cssH);
		state.dpr = devicePixelRatio;
		state.pixelWidth = width;
		state.pixelHeight = height;
		three.setSize(cssW, cssH, devicePixelRatio);
		lastWidth = cssW;
		lastHeight = cssH;
	}

	return {
		dispose: () => {
			stopObserving();
		},
	};
}
