import type { WidgetModel } from "./model";
import { createHelloView, renderHello } from "./view";

export function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
	const { btn, label } = createHelloView(el);
	const update = () => renderHello(model, label);

	btn.addEventListener("click", () => {
		const current = model.get("count");
		const n = typeof current === "number" ? current : 0;
		model.set("count", n + 1);
		model.save_changes();
	});

	update();
	model.on("change", update);
}

export default { render };
