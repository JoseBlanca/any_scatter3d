import type { WidgetModel } from "./model";
import { TRAITS } from "./model";

function populateLabelSelect(
	select: HTMLSelectElement,
	labels: string[],
	preferred?: string,
) {
	select.innerHTML = "";

	for (const label of labels) {
		const opt = document.createElement("option");
		opt.value = label;
		opt.textContent = label;
		select.appendChild(opt);
	}

	if (select.options.length === 0) return;

	if (
		preferred &&
		Array.from(select.options).some((o) => o.value === preferred)
	) {
		select.value = preferred;
	} else {
		select.selectedIndex = 0;
	}
}

function getLabelsFromModel(model: WidgetModel): string[] {
	const x = model.get(TRAITS.labels);
	if (!Array.isArray(x)) return [];
	return x.map((v) => String(v));
}

export type LabelsControllerDeps = {
	model: WidgetModel;
	select: HTMLSelectElement;
};

export function createLabelsController(deps: LabelsControllerDeps): {
	refresh: () => void;
	dispose: () => void;
} {
	const { model, select } = deps;

	const refresh = () => {
		const labels = getLabelsFromModel(model);
		const prev = select.value;
		populateLabelSelect(select, labels, prev);
	};

	// Subscribe internally (robust against forgotten wiring).
	const onLabelsChanged = () => refresh();
	model.on(`change:${TRAITS.labels}`, onLabelsChanged);

	return {
		refresh,
		dispose: () => {
			model.off(`change:${TRAITS.labels}`, onLabelsChanged);
		},
	};
}
