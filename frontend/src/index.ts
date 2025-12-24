import type { WidgetModel } from "./model";
import {
	createWidgetRoot,
	observeSize,
	createCanvas,
	renderHello,
} from "./view";

const RESIZE_THRESHOLD_PX = 2;

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	let cleanupPrev = (el as any).__any_scatter3d_cleanup as
		| undefined
		| (() => void);
	cleanupPrev?.();

	const { root, toolbar, canvasHost } = createWidgetRoot(el);

	const btn = document.createElement("button");
	btn.textContent = "Increment counts";
	const label = document.createElement("div");
	toolbar.appendChild(btn);
	toolbar.appendChild(label);

	const update = () => renderHello(model, label);

	const abortController = new AbortController();

	btn.addEventListener(
		"click",
		() => {
			const current = model.get("count");
			const n = typeof current === "number" ? current : 0;
			model.set("count", n + 1);
			model.save_changes();
		},
		{ signal: abortController.signal },
	);

	const { canvas, resizeCanvas } = createCanvas(canvasHost);
	const context = canvas.getContext("2d");

	let lastWidth = 0;
	let lastHeight = 0;

	const stopObserving = observeSize(canvasHost, (canvasWidth, canvasHeight) => {
		const roundedWidth = Math.round(canvasWidth);
		const roundedHeight = Math.round(canvasHeight);

		if (
			Math.abs(roundedWidth - lastWidth) < RESIZE_THRESHOLD_PX &&
			Math.abs(roundedHeight - lastHeight) < RESIZE_THRESHOLD_PX
		) {
			return;
		}

		lastWidth = roundedWidth;
		lastHeight = roundedHeight;

		const {} = resizeCanvas(roundedWidth, roundedHeight);
	});

	model.on("change", update);
	update();

	const cleanup = () => {
		abortController.abort();
		stopObserving();
		canvas.remove();
	};

	(el as any).__any_scatter3d_cleanup = cleanup;
}

export default { render };
