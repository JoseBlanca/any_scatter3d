import type { WidgetModel, RGB } from "./model";
import { TRAITS } from "./model";
import type { LegendView, LegendMode } from "./legend_view";

function isPromiseLike(x: unknown): x is PromiseLike<unknown> {
	return (
		typeof x === "object" &&
		x !== null &&
		"then" in x &&
		typeof (x as { then?: unknown }).then === "function"
	);
}

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

function readActive(x: unknown): string | null {
	if (typeof x !== "string") return null;
	return x === "" ? null : x; // defensive: empty string should behave like "no active"
}

export type LegendControllerDeps = {
	model: WidgetModel;
	view: LegendView;

	// Authoritative transport readiness (Python handshake).
	transportReady: () => boolean;
};

function readSide(x: unknown): "left" | "right" {
	return x === "left" ? "left" : "right";
}

function readDock(x: unknown): "top" | "bottom" {
	return x === "bottom" ? "bottom" : "top";
}

export function createLegendController(deps: LegendControllerDeps): {
	refreshFromModel: () => void;
	dispose: () => void;
} {
	const { model, view, transportReady } = deps;

	function safeSaveChanges(context: string) {
		try {
			const ret = model.save_changes();
			if (isPromiseLike(ret)) {
				ret.then(undefined, (err) => {
					console.warn(`[legend] save_changes failed (${context})`, err);
				});
			}
		} catch (err) {
			console.warn(`[legend] save_changes threw (${context})`, err);
		}
	}

	function refreshFromModel() {
		const labels = readStringList(model.get(TRAITS.labels), "labels_t");
		const colors = readRGBList(model.get(TRAITS.colors), "colors_t");

		if (colors.length !== labels.length) {
			throw new Error(
				`Palette incomplete: labels_t length=${labels.length} but colors_t length=${colors.length}`,
			);
		}

		const mode = readMode(model.get(TRAITS.interactionMode));
		const active = readActive(model.get(TRAITS.activeCategory));

		const side = readSide(model.get(TRAITS.legendSide));
		const dock = readDock(model.get(TRAITS.legendDock));
		view.setPlacement({ side, dock });

		view.render({
			mode,
			items: labels.map((label, i) => ({
				label,
				color: colors[i],
				isActive: active !== null && label === active,
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
		if (!transportReady()) {
			console.warn(
				"[legend] transport not ready yet (expected in marimo until cell run)",
			);
			return;
		}

		const mode = readMode(model.get(TRAITS.interactionMode));
		const active = readActive(model.get(TRAITS.activeCategory));

		if (mode === "lasso") {
			// In lasso: clicking active is a no-op; cannot clear.
			if (active !== null && label === active) return;
			model.set(TRAITS.activeCategory, label);
			safeSaveChanges("activeCategory");
			return;
		}

		// rotate mode
		if (active !== null && label === active) {
			model.set(TRAITS.activeCategory, null);
		} else {
			model.set(TRAITS.activeCategory, label);
		}
		safeSaveChanges("activeCategory");
	});

	// Subscribe to authoritative traits
	model.on(`change:${TRAITS.labels}`, onLegendTraitChange);
	model.on(`change:${TRAITS.colors}`, onLegendTraitChange);
	model.on(`change:${TRAITS.activeCategory}`, onLegendTraitChange);
	model.on(`change:${TRAITS.interactionMode}`, onLegendTraitChange);
	model.on(`change:${TRAITS.legendSide}`, onLegendTraitChange);
	model.on(`change:${TRAITS.legendDock}`, onLegendTraitChange);

	return {
		refreshFromModel,
		dispose: () => {
			model.off(`change:${TRAITS.labels}`, onLegendTraitChange);
			model.off(`change:${TRAITS.colors}`, onLegendTraitChange);
			model.off(`change:${TRAITS.activeCategory}`, onLegendTraitChange);
			model.off(`change:${TRAITS.interactionMode}`, onLegendTraitChange);
			model.off(`change:${TRAITS.legendSide}`, onLegendTraitChange);
			model.off(`change:${TRAITS.legendDock}`, onLegendTraitChange);
		},
	};
}
