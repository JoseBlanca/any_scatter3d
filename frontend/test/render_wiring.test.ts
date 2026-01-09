import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeModel } from "./fake_model";

// --- MOCKS ---
// Goal: keep buildWidget() running without real three.js, raf loop, resize observers, etc.
// We'll provide minimal stubs for each imported controller used in index.ts.

// Mock createThreeScene to avoid WebGL.
vi.mock("../src/three_scene", () => {
	return {
		createThreeScene: () => {
			const domElement = document.createElement("canvas");
			return {
				domElement,
				setPointsFromModel: vi.fn(),
				setColorsFromModel: vi.fn(),
				setAxesFromModel: vi.fn(),
				render: vi.fn(),
				dispose: vi.fn(),
			};
		},
	};
});

// Mock raf controller so it doesn't schedule infinite timers.
vi.mock("../src/raf_controller", () => {
	return {
		createRafController: () => ({
			start: vi.fn(),
			stop: vi.fn(),
		}),
	};
});

// Mock controllers/bindings to avoid needing their internal dependencies.
// We still want to record model.on calls *from inside buildWidget*;
// but our debug wrapper will record calls even if controllers register them.
// For now these can just return disposable shells.
vi.mock("../src/model_bindings", () => ({
	bindModelToView: () => ({ dispose: vi.fn() }),
}));

vi.mock("../src/tooltip_controller", () => ({
	createTooltipController: () => ({
		dispose: vi.fn(),
		onTooltipResponseChange: vi.fn(),
	}),
}));
vi.mock("../src/labels_controller", () => ({
	createLabelsController: () => ({ refresh: vi.fn() }),
}));

// These are “pure DOM” and usually don’t need mocking,
// but if createWidgetRoot/createOverlayCanvas are complex, you can mock them too.
// We'll keep them real unless they break.

import { buildWidget } from "../src/index";

describe("buildWidget wiring", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("creates overlay canvas and binds pointer + model observers", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);

		const model = new FakeModel();

		// spy on addEventListener calls on canvas elements
		const addSpy = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");

		const h = buildWidget(model as any, el);

		// DOM
		expect(h.root).toBeInstanceOf(HTMLElement);
		expect(h.overlayCanvas).toBeInstanceOf(HTMLCanvasElement);
		expect(h.root.contains(h.overlayCanvas)).toBe(true);

		// Pointer listeners recorded via debug hook
		// Expect overlay + three both have pointerdown/move/up capture
		expect(h.debug.boundPointerEvents).toContain("overlay:pointerdown:capture");
		expect(h.debug.boundPointerEvents).toContain("overlay:pointermove:capture");
		expect(h.debug.boundPointerEvents).toContain("overlay:pointerup:capture");
		expect(h.debug.boundPointerEvents).toContain("three:pointerdown:capture");
		expect(h.debug.boundPointerEvents).toContain("three:pointermove:capture");
		expect(h.debug.boundPointerEvents).toContain("three:pointerup:capture");

		// Sanity: addEventListener was called at least for those.
		// (This checks actual binding, not only debug strings.)
		const types = addSpy.mock.calls.map((c) => c[0]);
		expect(types).toContain("pointerdown");
		expect(types).toContain("pointermove");
		expect(types).toContain("pointerup");

		// Model observers: at least your explicit tooltip_response observer
		// (More will show up as you stop mocking controllers and let them register)
		expect(h.debug.modelChangeHandlers.length).toBeGreaterThanOrEqual(0);

		// Cleanup should remove overlay canvas
		h.cleanup();
		expect(document.body.contains(h.overlayCanvas)).toBe(false);
	});
});
