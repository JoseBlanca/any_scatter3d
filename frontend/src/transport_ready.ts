import type { WidgetModel } from "./model";
import { TRAITS } from "./model";

export type TransportReadyController = {
	/** Authoritative readiness (Python-controlled). */
	isReady: () => boolean;

	/**
	 * Attempt the one-time handshake: set client_ready_t and save_changes().
	 * Never throws; never infers readiness from return values.
	 */
	announceClientReadyOnce: () => void;

	/** Subscribe to readiness flips. Returns unsubscribe. */
	onReadyChange: (cb: () => void) => () => void;

	dispose: () => void;
};

export function createTransportReadyController(
	model: WidgetModel,
	opts?: {
		onError?: (err: unknown) => void;
	},
): TransportReadyController {
	let announced = false;
	const handlers = new Set<() => void>();

	const onChange = () => {
		for (const h of handlers) h();
	};

	model.on(`change:${TRAITS.interactiveReady}`, onChange);

	function isReady() {
		return model.get(TRAITS.interactiveReady) === true;
	}

	function announceClientReadyOnce() {
		if (announced) return;
		announced = true;

		model.set(TRAITS.clientReady, true);
		try {
			model.save_changes();
		} catch (err) {
			// Expected in "transport not ready yet" state.
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
