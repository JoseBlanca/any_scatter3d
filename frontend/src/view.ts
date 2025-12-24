import type { WidgetModel } from "./model";

export function createHelloView(el: HTMLElement) {
	el.innerHTML = "";
	el.style.fontFamily = "system-ui, sans-serif";
	el.style.padding = "12px";
	el.style.border = "1px solid #ddd";
	el.style.borderRadius = "8px";
	el.style.display = "flex";
	el.style.gap = "12px";
	el.style.alignItems = "center";

	const label = document.createElement("div");
	const btn = document.createElement("button");
	btn.textContent = "Increment counts";

	el.appendChild(btn);
	el.appendChild(label);
	return { btn, label };
}

export function renderHello(model: WidgetModel, label: HTMLElement) {
	const msg = model.get("message");
	const count = model.get("count");
	const msgStr = typeof msg === "string" ? msg : "(message not string)";
	const countNum = typeof count === "number" ? count : NaN;
	label.textContent = `${msgStr} | count = ${Number.isFinite(countNum) ? countNum : "(not a number)"}`;
}
