import type { WidgetModel } from "./model";

export function createWidgetRoot(el: HTMLElement) {
	el.innerHTML = "";

	const root = document.createElement("div");
	root.style.display = "flex";
	root.style.flexDirection = "column";
	root.style.gap = "12px";
	root.style.padding = "12px";
	root.style.fontFamily = "system-ui, sans-serif";

	const toolbar = document.createElement("div");
	toolbar.style.display = "flex";
	toolbar.style.gap = "12px";
	toolbar.style.alignItems = "center";

	const canvasHost = document.createElement("div");
	canvasHost.style.width = "100%";
	canvasHost.style.minHeight = "300px";
	canvasHost.style.border = "1px solid #ddd";
	canvasHost.style.borderRadius = "8px";

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

export function renderHello(model: WidgetModel, label: HTMLElement) {
	const msg = model.get("message");
	const count = model.get("count");
	const msgStr = typeof msg === "string" ? msg : "(message not string)";
	const countNum = typeof count === "number" ? count : NaN;
	label.textContent = `${msgStr} | count = ${Number.isFinite(countNum) ? countNum : "(not a number)"}`;
}
