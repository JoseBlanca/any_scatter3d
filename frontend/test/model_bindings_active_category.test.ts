import { describe, it, expect, vi } from "vitest";
import { bindModelToView } from "../src/model_bindings";
import { TRAITS } from "../src/model";
import { FakeModel } from "./fake_model";

describe("model_bindings: active_category_t", () => {
	it("changing active_category_t triggers a recolor exactly once", () => {
		const model = new FakeModel();

		const three = {
			setPointsFromModel: vi.fn(),
			setColorsFromModel: vi.fn(),
			setSizesFromModel: vi.fn(),
			setAxesFromModel: vi.fn(),
			rebuildAxisLabels: vi.fn(),
			domElement: document.createElement("canvas"),
			setSize: vi.fn(),
			pickPointIndex: vi.fn(),
			selectMaskInLasso: vi.fn(),
			render: vi.fn(),
			dispose: vi.fn(),
		} as any;

		const refreshLegendUI = vi.fn();
		const onTooltipResponseChange = vi.fn();

		const b = bindModelToView({
			model: model as any,
			three,
			refreshLegendUI,
			onTooltipResponseChange,
		});

		// Simulate python updating active category
		model.set(TRAITS.activeCategory, "a");
		model.emit(`change:${TRAITS.activeCategory}`);
		expect(three.setColorsFromModel).toHaveBeenCalledTimes(1);
		expect(three.setSizesFromModel).toHaveBeenCalledTimes(1);

		expect(three.setColorsFromModel).toHaveBeenCalledTimes(1);

		b.dispose();
	});
});
