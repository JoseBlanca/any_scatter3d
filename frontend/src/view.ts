import type { WidgetModel } from "./model";

const MIN_CANVAS_SIZE = "300px";

export type PointerInfo = {
	cssX: number;
	cssY: number;
	normDevCoordX: number; // -1..1
	normDevCoordY: number; // -1..1
	isInside: boolean;
};

export function get2dContext(canvas: HTMLCanvasElement) {
	return canvas.getContext("2d");
}

export function pointerInfoFromEvent(
	event: PointerEvent,
	canvas: HTMLCanvasElement,
): PointerInfo {
	const rect = canvas.getBoundingClientRect();
	const cssX = event.clientX - rect.left;
	const cssY = event.clientY - rect.top;

	const isInside =
		cssX >= 0 && cssY >= 0 && cssX <= rect.width && cssY <= rect.height;

	const x01 = rect.width > 0 ? cssX / rect.width : 0;
	const y01 = rect.height > 0 ? cssY / rect.height : 0;

	const normDevCoordX = x01 * 2 - 1;
	const normDevCoordY = -(y01 * 2 - 1);

	return { cssX, cssY, normDevCoordX, normDevCoordY, isInside };
}

export function createWidgetRoot(el: HTMLElement) {
	el.innerHTML = "";

	el.style.height = "100%";
	el.style.minHeight = MIN_CANVAS_SIZE;

	const root = document.createElement("div");
	root.style.display = "flex";
	root.style.flexDirection = "column";
	root.style.gap = "12px";
	root.style.padding = "12px";
	root.style.fontFamily = "system-ui, sans-serif";

	root.style.height = "100%";
	root.style.boxSizing = "border-box"; // padding counted inside height

	const toolbar = document.createElement("div");
	toolbar.style.display = "flex";
	toolbar.style.gap = "12px";
	toolbar.style.alignItems = "center";
	toolbar.style.flex = "0 0 auto";

	const canvasHost = document.createElement("div");
	canvasHost.style.width = "100%";
	canvasHost.style.border = "1px solid #ddd";
	canvasHost.style.borderRadius = "8px";
	canvasHost.style.minHeight = "0";

	canvasHost.style.flex = "1 1 auto";

	root.appendChild(toolbar);
	root.appendChild(canvasHost);
	el.appendChild(root);

	return { root, toolbar, canvasHost };
}

export function observeSize(
	target: HTMLElement,
	onSize: (w: number, h: number) => void,
) {
	let requestedAnimationFrame = 0;

	const resizeObserver = new ResizeObserver((entries) => {
		const entry = entries[0];
		if (!entry) return;

		const { width, height } = entry.contentRect;
		if (width <= 0 || height <= 0) return;

		cancelAnimationFrame(requestedAnimationFrame);
		requestedAnimationFrame = requestAnimationFrame(() =>
			onSize(width, height),
		);
	});

	resizeObserver.observe(target);

	return () => {
		cancelAnimationFrame(requestedAnimationFrame);
		resizeObserver.disconnect();
	};
}

export function createCanvas(canvasHost: HTMLElement) {
	const canvas = document.createElement("canvas");
	canvas.style.display = "block";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	canvasHost.appendChild(canvas);

	function resizeCanvas(cssWidth: number, cssHeight: number) {
		canvas.style.width = `${cssWidth}px`;
		canvas.style.height = `${cssHeight}px`;

		const devicePixelRatio = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(cssWidth * devicePixelRatio));
		const height = Math.max(1, Math.round(cssHeight * devicePixelRatio));

		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;

		return { devicePixelRatio, width, height };
	}
	return { canvas, resizeCanvas };
}
