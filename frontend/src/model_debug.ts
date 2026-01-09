import type { WidgetModel } from "./model";
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

export function makeDebugModel(
	base: WidgetModel,
	debug: { modelChangeHandlers: string[] },
): WidgetModel {
	return {
		get: (key: string) => base.get(key),
		set: (key: string, value: unknown) => base.set(key, value),

		save_changes: () => {
			// anywidget model exposes dirtyFields; use it to detect a "send expected" situation.
			const dirtyBefore = (base as any)?.dirtyFields?.size ?? 0;

			const ret = base.save_changes();

			// Professional fail-fast: if we had dirty fields, a send was required.
			// If save_changes returns void, the widget is not interactive yet (no comm).
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
				return undefined;
			}

			return ret as any;
		},

		on: (event: string, cb: () => void) => {
			const trait = traitFromChangeEvent(event);
			if (trait) debug.modelChangeHandlers.push(trait);
			base.on(event, cb);
		},

		off: (event: string, cb: () => void) => {
			base.off(event, cb);
		},
	};
}
