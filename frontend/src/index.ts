import type { WidgetModel } from "./model";
import { createWidgetRoot, observeSize, renderHello } from "./view";

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	let cleanupPrev = (el as any).__any_scatter3d_cleanup as
		| undefined
		| (() => void);
	cleanupPrev?.();

	const { toolbar, canvasHost } = createWidgetRoot(el);

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

	let lastWidth = 0;
	let lastHeight = 0;

	const stopObserving = observeSize(canvasHost, (width, height) => {
		if (width == lastWidth && height == lastHeight) return;
		lastWidth = width;
		lastHeight = height;

		console.log("size", width, height);
	});

	model.on("change", update);
	update();

	const cleanup = () => {
		abortController.abort();
		stopObserving();
	};

	(el as any).__any_scatter3d_cleanup = cleanup;
}

export default { render };
