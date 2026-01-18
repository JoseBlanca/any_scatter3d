import type { WidgetModel, TraitValueMap, SaveChangesReturn } from "./model";
import { dlog } from "./debug";

function traitFromChangeEvent(event: string): string | null {
	if (!event.startsWith("change:")) return null;
	return event.slice("change:".length);
}

/**
 * Wraps a widget model to:
 *  - record model.on("change:...") registrations
 *  - fail fast if save_changes() cannot send (transport not ready)
 */
let __loggedTransportNotReady = false;

function readDirtyFieldsSize(model: unknown): number {
	// anywidget model may expose dirtyFields as a Set-like with a numeric .size.
	const m = model as Record<string, unknown>;
	const dirty = m["dirtyFields"];

	if (dirty && typeof dirty === "object") {
		const size = (dirty as Record<string, unknown>)["size"];
		if (typeof size === "number" && Number.isFinite(size) && size >= 0) {
			return size;
		}
	}
	return 0;
}

export function makeDebugModel(
	base: WidgetModel,
	debug: { modelChangeHandlers: string[] },
): WidgetModel {
	return {
		get: <K extends keyof TraitValueMap>(key: K): TraitValueMap[K] =>
			base.get(key),

		set: <K extends keyof TraitValueMap>(
			key: K,
			value: TraitValueMap[K],
		): void => base.set(key, value),

		save_changes: (): SaveChangesReturn => {
			const dirtyBefore = readDirtyFieldsSize(base);

			const ret = base.save_changes();

			// Professional fail-fast: if we had dirty fields, a send was required.
			// If save_changes returns undefined, the widget is not interactive yet (no comm).
			if (dirtyBefore > 0 && ret === undefined) {
				// Debug-only, one-shot. Never crash render due to missing transport.
				if (!__loggedTransportNotReady) {
					__loggedTransportNotReady = true;
					dlog(
						"lasso",
						"transport not ready (save_changes returned void); widget not interactive until marimo cell is executed",
						{ dirtyBefore },
					);
				}
			}

			return ret;
		},

		on: (event: string, cb: () => void): void => {
			const trait = traitFromChangeEvent(event);
			if (trait) debug.modelChangeHandlers.push(trait);
			base.on(event, cb);
		},

		off: (event: string, callback: () => void): void => {
			base.off(event, callback);
		},
	};
}
