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
				setSizesFromModel: vi.fn(),
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
		model.set("category_editable_t", true);

		// spy on addEventListener calls on canvas elements
		const addSpy = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");

		const h = buildWidget(model as any, el);

		// DOM
		expect(h.root).toBeInstanceOf(HTMLElement);
		expect(h.overlayCanvas).toBeInstanceOf(HTMLCanvasElement);
		expect(h.root.contains(h.overlayCanvas)).toBe(true);

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
		model.set("category_editable_t", true);

		const h = buildWidget(model as any, el);

		// Sanity: createThreeScene ran and we captured the instance
		expect(lastThree).toBeTruthy();

		const beforeColors = lastThree.setColorsFromModel.mock.calls.length;
		const beforeSizes = lastThree.setSizesFromModel.mock.calls.length;

		model.set(TRAITS.codedValues, new Uint8Array([0, 0, 1, 0])); // arbitrary bytes
		model.emit(changeEvent(TRAITS.codedValues));

		expect(lastThree.setColorsFromModel.mock.calls.length).toBe(
			beforeColors + 1,
		);
		expect(lastThree.setSizesFromModel.mock.calls.length).toBe(beforeSizes + 1);

		h.cleanup();
	});
	it("initializes point sizes on startup", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);

		const model = new FakeModel();

		// minimal trait state (same as other tests)
		model.set("labels_t", []);
		model.set("colors_t", []);
		model.set("active_category_t", "");
		model.set("interaction_mode_t", "rotate");
		model.set("legend_side_t", "right");
		model.set("legend_dock_t", "top");
		model.set("category_editable_t", true);

		const h = buildWidget(model as any, el);

		expect(lastThree).toBeTruthy();
		expect(lastThree.setSizesFromModel).toHaveBeenCalledTimes(1);

		h.cleanup();
	});
	it("switches back to rotate when rotate button is clicked after entering lasso", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);

		const model = new FakeModel();

		// minimal trait state
		model.set("labels_t", []);
		model.set("colors_t", []);
		model.set("active_category_t", "");
		model.set("interaction_mode_t", "rotate");
		model.set("legend_side_t", "right");
		model.set("legend_dock_t", "top");
		model.set("category_editable_t", true);

		// make lasso button not early-return
		model.set("interactive_ready_t", true);

		const h = buildWidget(model as any, el);

		const buttons = Array.from(h.root.querySelectorAll("button"));
		const rotateBtn = buttons.find((b) => b.textContent === "Rotate");
		const lassoBtn = buttons.find((b) => b.textContent === "Lasso");
		const addBtn = buttons.find((b) => b.textContent === "Add");
		const removeBtn = buttons.find((b) => b.textContent === "Remove");

		expect(rotateBtn).toBeTruthy();
		expect(lassoBtn).toBeTruthy();
		expect(addBtn).toBeTruthy();
		expect(removeBtn).toBeTruthy();

		// enter lasso => add/remove visible
		lassoBtn!.click();
		expect(addBtn!.style.display).not.toBe("none");
		expect(removeBtn!.style.display).not.toBe("none");

		// BUG: currently this does not update UI back to rotate
		rotateBtn!.click();

		// expected: add/remove hidden again
		expect(addBtn!.style.display).toBe("none");
		expect(removeBtn!.style.display).toBe("none");

		h.cleanup();
	});
});
