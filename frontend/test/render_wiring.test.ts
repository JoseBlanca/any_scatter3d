import { TRAITS, changeEvent } from "../src/model";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeModel } from "./fake_model";

let lastThree: any = null;

// --- MOCKS ---
// Goal: keep buildWidget() running without real three.js, raf loop, resize observers, etc.
// We'll provide minimal stubs for each imported controller used in index.ts.

// Mock createThreeScene to avoid WebGL.
vi.mock("../src/three_scene", () => {
	return {
		createThreeScene: () => {
			const domElement = document.createElement("canvas");
			lastThree = {
				domElement,
				setPointsFromModel: vi.fn(),
				setColorsFromModel: vi.fn(),
				setAxesFromModel: vi.fn(),
				render: vi.fn(),
				dispose: vi.fn(),
			};
			return lastThree;
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

vi.mock("../src/model_bindings", async () => {
	const actual = await vi.importActual<any>("../src/model_bindings");
	return {
		...actual,
	};
});

vi.mock("../src/tooltip_controller", () => ({
	createTooltipController: () => ({
		dispose: vi.fn(),
		onTooltipResponseChange: vi.fn(),
	}),
}));
vi.mock("../src/labels_controller", () => ({
	createLabelsController: () => ({ refresh: vi.fn(), dispose: vi.fn() }),
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

		// Minimal trait state required for legend/controller startup
		model.set("labels_t", []);
		model.set("colors_t", []);
		model.set("active_category_t", "");
		model.set("interaction_mode_t", "rotate");
		model.set("legend_side_t", "right");
		model.set("legend_dock_t", "top");

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

		// At minimum, buildWidget should subscribe to interactive_ready_t via transport controller.
		expect(h.debug.modelChangeHandlers).toContain("interactive_ready_t");

		// Cleanup should remove overlay canvas
		h.cleanup();
		addSpy.mockRestore();
		expect(document.body.contains(h.overlayCanvas)).toBe(false);
	});

	it("recolors points when coded_values_t changes", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);

		const model = new FakeModel();

		// minimal trait state (same as other test)
		model.set("labels_t", []);
		model.set("colors_t", []);
		model.set("active_category_t", "");
		model.set("interaction_mode_t", "rotate");
		model.set("legend_side_t", "right");
		model.set("legend_dock_t", "top");

		const h = buildWidget(model as any, el);

		// Sanity: createThreeScene ran and we captured the instance
		expect(lastThree).toBeTruthy();

		// Simulate Python pushing new coded values (payload doesn't matter for this wiring test)
		model.set(TRAITS.codedValues, new Uint8Array([0, 0, 1, 0])); // arbitrary bytes
		model.emit(changeEvent(TRAITS.codedValues));

		const before = lastThree.setColorsFromModel.mock.calls.length;

		model.set(TRAITS.codedValues, new Uint8Array([0, 0, 1, 0]));
		model.emit(changeEvent(TRAITS.codedValues));

		const after = lastThree.setColorsFromModel.mock.calls.length;
		expect(after).toBe(before + 1);

		h.cleanup();
	});
});
