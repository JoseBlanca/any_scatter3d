import { describe, it, expect } from "vitest";
import { FakeModel } from "./fake_model";
import { createLegendView } from "../src/legend_view";
import { createLegendController } from "../src/legend_controller";
import { TRAITS } from "../src/model";

function setupModel(model: FakeModel) {
	model.set(TRAITS.labels, ["a", "b", "c"]);
	model.set(TRAITS.colors, [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]);
}

const transportReadyYes = () => true;
const transportReadyNo = () => false;

describe("legend controller", () => {
	it("rotate: clicking inactive sets active; clicking active clears", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);

		const model = new FakeModel();
		setupModel(model);
		model.set(TRAITS.interactionMode, "rotate");
		model.set(TRAITS.activeCategory, null);

		const view = createLegendView(host);
		const ctrl = createLegendController({
			model: model as any,
			view,
			transportReady: transportReadyYes,
		});

		ctrl.refreshFromModel();

		// click "a" -> set active_category_t="a"
		const a = host.querySelector(
			'[data-testid="legend-item:a"]',
		) as HTMLElement;
		a.click();
		expect(model.setCalls.at(-1)).toEqual({
			key: TRAITS.activeCategory,
			value: "a",
		});

		// Simulate Python round-trip by updating model + emitting change
		model.set(TRAITS.activeCategory, "a");
		model.emit(`change:${TRAITS.activeCategory}`);

		// IMPORTANT: legend re-render recreates DOM nodes, so re-query.
		const a2 = host.querySelector(
			'[data-testid="legend-item:a"]',
		) as HTMLElement;

		// click "a" again -> clear to null
		a2.click();
		expect(model.setCalls.at(-1)).toEqual({
			key: TRAITS.activeCategory,
			value: null,
		});

		ctrl.dispose();
		view.dispose();
		host.remove();
	});

	it("lasso: clicking inactive switches; clicking active is no-op", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);

		const model = new FakeModel();
		setupModel(model);
		model.set(TRAITS.interactionMode, "lasso");
		model.set(TRAITS.activeCategory, "a");

		const view = createLegendView(host);
		const ctrl = createLegendController({
			model: model as any,
			view,
			transportReady: transportReadyYes,
		});

		ctrl.refreshFromModel();

		const a = host.querySelector(
			'[data-testid="legend-item:a"]',
		) as HTMLElement;
		const b = host.querySelector(
			'[data-testid="legend-item:b"]',
		) as HTMLElement;

		const before = model.setCalls.length;

		// clicking active "a" -> no-op
		a.click();
		expect(model.setCalls.length).toBe(before);

		// clicking inactive "b" -> set active_category_t="b"
		b.click();
		expect(model.setCalls.at(-1)).toEqual({
			key: TRAITS.activeCategory,
			value: "b",
		});

		ctrl.dispose();
		view.dispose();
		host.remove();
	});

	it("hover does not write to model (no redraw trigger path here)", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);

		const model = new FakeModel();
		setupModel(model);
		model.set(TRAITS.interactionMode, "rotate");
		model.set(TRAITS.activeCategory, null);

		const view = createLegendView(host);
		const ctrl = createLegendController({
			model: model as any,
			view,
			transportReady: transportReadyYes,
		});

		ctrl.refreshFromModel();

		const a = host.querySelector(
			'[data-testid="legend-item:a"]',
		) as HTMLElement;

		const before = model.setCalls.length;

		// Hover events should not change model.
		a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		a.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

		expect(model.setCalls.length).toBe(before);

		ctrl.dispose();
		view.dispose();
		host.remove();
	});

	it("not ready: clicking legend item does nothing (no set/save)", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);

		const model = new FakeModel();
		setupModel(model);
		model.set(TRAITS.interactionMode, "rotate");
		model.set(TRAITS.activeCategory, null);

		const view = createLegendView(host);
		const ctrl = createLegendController({
			model: model as any,
			view,
			transportReady: transportReadyNo,
		});

		ctrl.refreshFromModel();

		const a = host.querySelector(
			'[data-testid="legend-item:a"]',
		) as HTMLElement;

		const beforeSet = model.setCalls.length;
		const beforeSave = model.saveCalls;

		a.click();

		expect(model.setCalls.length).toBe(beforeSet);
		expect(model.saveCalls).toBe(beforeSave);

		ctrl.dispose();
		view.dispose();
		host.remove();
	});

	it("palette completeness is strict: labels_t and colors_t length mismatch throws", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);

		const model = new FakeModel();
		model.set(TRAITS.labels, ["a", "b", "c"]);
		model.set(TRAITS.colors, [
			[1, 0, 0],
			[0, 1, 0],
		]); // missing one
		model.set(TRAITS.interactionMode, "rotate");
		model.set(TRAITS.activeCategory, null);

		const view = createLegendView(host);
		const ctrl = createLegendController({
			model: model as any,
			view,
			transportReady: transportReadyYes,
		});

		expect(() => ctrl.refreshFromModel()).toThrow(/Palette incomplete/);

		ctrl.dispose();
		view.dispose();
		host.remove();
	});
	it("lasso invariant (python-authoritative): when entering lasso with no active category, python sets first label and UI reflects it", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);

		const model = new FakeModel();
		setupModel(model);

		// Start in rotate with no active category
		model.set(TRAITS.interactionMode, "rotate");
		model.set(TRAITS.activeCategory, null);

		const view = createLegendView(host);
		const ctrl = createLegendController({
			model: model as any,
			view,
			transportReady: transportReadyYes,
		});

		ctrl.refreshFromModel();

		// "Enter lasso mode" (authoritative change comes from python)
		model.set(TRAITS.interactionMode, "lasso");
		model.emit(`change:${TRAITS.interactionMode}`);

		// Python must enforce the invariant by selecting first label deterministically.
		model.set(TRAITS.activeCategory, "a");
		model.emit(`change:${TRAITS.activeCategory}`);

		// Assert UI reflects authoritative state: "a" active.
		const a = host.querySelector(
			'[data-testid="legend-item:a"]',
		) as HTMLElement;
		const b = host.querySelector(
			'[data-testid="legend-item:b"]',
		) as HTMLElement;

		expect(a.dataset.active).toBe("1");
		expect(b.dataset.active).toBe("0");

		ctrl.dispose();
		view.dispose();
		host.remove();
	});
});
