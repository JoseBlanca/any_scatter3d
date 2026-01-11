import type { WidgetModel, RGB } from "./model";
import { TRAITS } from "./model";
import type { LegendView, LegendMode } from "./legend_view";

function readStringList(x: unknown, name: string): string[] {
	if (!Array.isArray(x)) {
		throw new Error(`${name} must be an array`);
	}
	return x.map((v) => String(v));
}

function readRGBList(x: unknown, name: string): RGB[] {
	if (!Array.isArray(x)) {
		throw new Error(`${name} must be an array`);
	}
	const out: RGB[] = [];
	for (let i = 0; i < x.length; i++) {
		const v = x[i];
		if (!Array.isArray(v) || v.length !== 3) {
			throw new Error(`${name}[${i}] must be [r,g,b]`);
		}
		const r = Number(v[0]);
		const g = Number(v[1]);
		const b = Number(v[2]);
		if (![r, g, b].every((z) => Number.isFinite(z))) {
			throw new Error(`${name}[${i}] must contain finite numbers`);
		}
		out.push([r, g, b]);
	}
	return out;
}

function readMode(x: unknown): LegendMode {
	return x === "lasso" ? "lasso" : "rotate";
}

function readActive(x: unknown): string {
	return typeof x === "string" ? x : "";
}

export type LegendControllerDeps = {
	model: WidgetModel;
	view: LegendView;

	// Authoritative transport readiness (Python handshake).
	transportReady: () => boolean;
};

export function createLegendController(deps: LegendControllerDeps): {
	refreshFromModel: () => void;
	dispose: () => void;
} {
	const { model, view, transportReady } = deps;

	function refreshFromModel() {
		const labels = readStringList(model.get(TRAITS.labels), "labels_t");
		const colors = readRGBList(model.get(TRAITS.colors), "colors_t");

		// Palette completeness (strict): must match labels one-to-one.
		// This is required even if some labels have zero points.
		if (colors.length !== labels.length) {
			throw new Error(
				`Palette incomplete: labels_t length=${labels.length} but colors_t length=${colors.length}`,
			);
		}

		const mode = readMode(model.get(TRAITS.interactionMode));
		const active = readActive(model.get(TRAITS.activeCategory));

		view.render({
			mode,
			items: labels.map((label, i) => ({
				label,
				color: colors[i],
				isActive: label === active,
			})),
		});
	}

	function onLegendTraitChange() {
		refreshFromModel();
	}

	// Semantics on click: emit intent by updating active_category_t.
	view.onItemClick((label) => {
		// If transport is not ready, legend must be non-interactive.
		// No UI/UX changes here: click is simply ignored.
		if (!transportReady()) return;

		const mode = readMode(model.get(TRAITS.interactionMode));
		const active = readActive(model.get(TRAITS.activeCategory));

		if (mode === "lasso") {
			// In lasso: clicking active is a no-op; cannot clear.
			if (label === active) return;
			model.set(TRAITS.activeCategory, label);
			model.save_changes();
			return;
		}

		// rotate mode
		if (label === active) {
			model.set(TRAITS.activeCategory, "");
		} else {
			model.set(TRAITS.activeCategory, label);
		}
		model.save_changes();
	});

	// Subscribe to authoritative traits
	model.on(`change:${TRAITS.labels}`, onLegendTraitChange);
	model.on(`change:${TRAITS.colors}`, onLegendTraitChange);
	model.on(`change:${TRAITS.activeCategory}`, onLegendTraitChange);
	model.on(`change:${TRAITS.interactionMode}`, onLegendTraitChange);

	return {
		refreshFromModel,
		dispose: () => {
			model.off(`change:${TRAITS.labels}`, onLegendTraitChange);
			model.off(`change:${TRAITS.colors}`, onLegendTraitChange);
			model.off(`change:${TRAITS.activeCategory}`, onLegendTraitChange);
			model.off(`change:${TRAITS.interactionMode}`, onLegendTraitChange);
		},
	};
}
