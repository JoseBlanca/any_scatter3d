export type RafControllerDeps = {
	// called once per animation frame
	onFrame: () => void;
};

export function createRafController(deps: RafControllerDeps): {
	start: () => void;
	stop: () => void;
} {
	const { onFrame } = deps;

	let rafId: number | null = null;

	const tick = () => {
		onFrame();
		rafId = requestAnimationFrame(tick);
	};

	return {
		start: () => {
			if (rafId != null) return; // already running
			rafId = requestAnimationFrame(tick);
		},
		stop: () => {
			if (rafId == null) return;
			cancelAnimationFrame(rafId);
			rafId = null;
		},
	};
}
