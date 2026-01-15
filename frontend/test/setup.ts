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

// JSDOM doesn't implement ResizeObserver.
// Provide a minimal controllable mock that lets tests trigger resize events deterministically.
//
// Design goals:
// - minimal surface area (observe/unobserve/disconnect)
// - no DOM layout simulation
// - tests remain in control by calling __triggerResize()
type ROEntry = { target: Element; contentRect: DOMRectReadOnly };

type ROCallback = (entries: ROEntry[]) => void;

class TestResizeObserver {
	private cb: ROCallback;
	private observed = new Set<Element>();

	constructor(cb: ROCallback) {
		this.cb = cb;
		(TestResizeObserver as any).__instances.add(this);
	}

	observe(target: Element) {
		this.observed.add(target);
	}

	unobserve(target: Element) {
		this.observed.delete(target);
	}

	disconnect() {
		this.observed.clear();
		(TestResizeObserver as any).__instances.delete(this);
	}

	// internal: invoked by global trigger
	__notify(target: Element) {
		if (!this.observed.has(target)) return;

		// Use getBoundingClientRect as a proxy for size in tests.
		const r = (target as HTMLElement).getBoundingClientRect?.();
		const width = r?.width ?? 0;
		const height = r?.height ?? 0;

		const entry: ROEntry = {
			target,
			contentRect: {
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				right: width,
				bottom: height,
				width,
				height,
				toJSON() {
					return {
						x: 0,
						y: 0,
						width,
						height,
						top: 0,
						left: 0,
						right: width,
						bottom: height,
					};
				},
			} as unknown as DOMRectReadOnly,
		};

		this.cb([entry]);
	}

	static __instances: Set<TestResizeObserver> = new Set();
}

// Install if missing
if (!(globalThis as any).ResizeObserver) {
	(globalThis as any).ResizeObserver = TestResizeObserver as any;
}

// Test helper: trigger resize observers for a given element.
// This is intentionally not typed as public API; it’s a test-only hook.
(globalThis as any).__triggerResize = (target: Element) => {
	for (const ro of (TestResizeObserver as any)
		.__instances as Set<TestResizeObserver>) {
		ro.__notify(target);
	}
};

// Optional: OrbitControls / three.js sometimes inspects WebGL context.
// If createThreeScene tries to create a WebGLRenderer, you may need to mock it instead.
// We'll handle that in the test by mocking createThreeScene.

vi.mock("../src/resize_controller", () => ({
	createResizeController: () => ({
		applyNow: vi.fn(),
		dispose: vi.fn(),
	}),
}));
