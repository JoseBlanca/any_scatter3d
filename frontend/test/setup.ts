import { vi } from "vitest";

// JSDOM doesn't implement all canvas APIs. Your code calls getContext("2d").
// Provide a minimal stub so createOverlayCanvas/get2dContext won't explode.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
	value: function getContext(type: string) {
		if (type === "2d") {
			return {
				clearRect() {},
				beginPath() {},
				moveTo() {},
				lineTo() {},
				stroke() {},
				closePath() {},
				// Add more if drawOverlay uses them.
			};
		}
		return null;
	},
});

// requestAnimationFrame is used by your boot logs / RAF controller in some setups.
// Your buildWidget() calls raf.start(). That will use rAF.
// Provide a deterministic stub.
if (!globalThis.requestAnimationFrame) {
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
		// Run ASAP in tests (deterministic, no real animation timing needed)
		return setTimeout(() => cb(performance.now()), 0) as unknown as number;
	};
}

if (!globalThis.cancelAnimationFrame) {
	globalThis.cancelAnimationFrame = (id: number) => {
		clearTimeout(id as unknown as NodeJS.Timeout);
	};
}

// Optional: if some code reads ResizeObserver, stub it (common in resize controllers).
if (!(globalThis as any).ResizeObserver) {
	(globalThis as any).ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

// Optional: OrbitControls / three.js sometimes inspects WebGL context.
// If createThreeScene tries to create a WebGLRenderer, you may need to mock it instead.
// We'll handle that in the test by mocking createThreeScene.

vi.mock("../src/resize_controller", () => ({
	createResizeController: () => ({
		applyNow: vi.fn(),
		dispose: vi.fn(),
	}),
}));
