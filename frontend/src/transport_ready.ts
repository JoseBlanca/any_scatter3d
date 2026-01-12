import type { WidgetModel } from "./model";
import { TRAITS } from "./model";

export type TransportReadyController = {
	isReady: () => boolean;
	announceClientReadyOnce: () => void;
	onReadyChange: (cb: () => void) => () => void;
	dispose: () => void;
};

export function createTransportReadyController(
	model: WidgetModel,
	opts?: { onError?: (err: unknown) => void },
): TransportReadyController {
	let announcedOk = false; // "Python acked" latch
	let lastAttemptMs = -Infinity;
	let inFlight = false;

	const handlers = new Set<() => void>();

	const onChange = () => {
		// If Python acked, latch it. This is the only authoritative success condition.
		if (model.get(TRAITS.interactiveReady) === true) announcedOk = true;
		for (const h of handlers) h();
	};

	model.on(`change:${TRAITS.interactiveReady}`, onChange);

	function isReady() {
		return model.get(TRAITS.interactiveReady) === true;
	}

	function announceClientReadyOnce() {
		// Only Python can confirm readiness.
		if (announcedOk || isReady()) {
			announcedOk = true;
			return;
		}

		// Avoid spamming
		const now = performance.now();
		if (now - lastAttemptMs < 250) return;
		lastAttemptMs = now;

		// Don't start a second attempt while one is in flight
		if (inFlight) return;

		// Force a real diff even if the JS model is stuck at true
		if (model.get(TRAITS.clientReady) === true) {
			model.set(TRAITS.clientReady, false);
		}
		model.set(TRAITS.clientReady, true);

		try {
			inFlight = true;
			const ret = model.save_changes();

			if (ret && typeof (ret as any).then === "function") {
				(ret as PromiseLike<unknown>).then(
					() => {
						inFlight = false;
						// Do NOT set announcedOk here; wait for interactive_ready_t
					},
					(err) => {
						inFlight = false;
						model.set(TRAITS.clientReady, false);
						opts?.onError?.(err);
					},
				);
			} else {
				inFlight = false;
				// Do NOT set announcedOk here; wait for interactive_ready_t
			}
		} catch (err) {
			inFlight = false;
			model.set(TRAITS.clientReady, false);
			opts?.onError?.(err);
		}
	}

	function onReadyChange(cb: () => void) {
		handlers.add(cb);
		return () => handlers.delete(cb);
	}

	function dispose() {
		model.off(`change:${TRAITS.interactiveReady}`, onChange);
		handlers.clear();
	}

	return { isReady, announceClientReadyOnce, onReadyChange, dispose };
}
