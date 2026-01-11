import { describe, it, expect, vi } from "vitest";
import { FakeModel } from "./fake_model";
import { bindModelToView } from "../src/model_bindings";
import { TRAITS } from "../src/model";

function makeThreeStub() {
	return {
		setPointsFromModel: vi.fn(),
		setColorsFromModel: vi.fn(),
		setAxesFromModel: vi.fn(),
		rebuildAxisLabels: vi.fn(),
	} as any;
}

describe("bindModelToView", () => {
	it("legend-related trait changes refresh legend UI and recolor exactly once", () => {
		const model = new FakeModel();
		const three = makeThreeStub();

		const refreshLegendUI = vi.fn();
		const onTooltipResponseChange = vi.fn();

		const bindings = bindModelToView({
			model: model as any,
			three,
			refreshLegendUI,
			onTooltipResponseChange,
		});

		// labels -> refresh + recolor
		model.emit(`change:${TRAITS.labels}`);
		expect(refreshLegendUI).toHaveBeenCalledTimes(1);
		expect(three.setColorsFromModel).toHaveBeenCalledTimes(1);

		// colors -> refresh + recolor
		model.emit(`change:${TRAITS.colors}`);
		expect(refreshLegendUI).toHaveBeenCalledTimes(2);
		expect(three.setColorsFromModel).toHaveBeenCalledTimes(2);

		// missingColor -> refresh + recolor
		model.emit(`change:${TRAITS.missingColor}`);
		expect(refreshLegendUI).toHaveBeenCalledTimes(3);
		expect(three.setColorsFromModel).toHaveBeenCalledTimes(3);

		bindings.dispose();
	});

	it("coded_values changes recolor but do not refresh legend UI", () => {
		const model = new FakeModel();
		const three = makeThreeStub();

		const refreshLegendUI = vi.fn();
		const onTooltipResponseChange = vi.fn();

		const bindings = bindModelToView({
			model: model as any,
			three,
			refreshLegendUI,
			onTooltipResponseChange,
		});

		model.emit(`change:${TRAITS.codedValues}`);

		expect(three.setColorsFromModel).toHaveBeenCalledTimes(1);
		expect(refreshLegendUI).toHaveBeenCalledTimes(0);

		bindings.dispose();
	});

	it("xyz changes update points and then recolor", () => {
		const model = new FakeModel();
		const three = makeThreeStub();

		const refreshLegendUI = vi.fn();
		const onTooltipResponseChange = vi.fn();

		const bindings = bindModelToView({
			model: model as any,
			three,
			refreshLegendUI,
			onTooltipResponseChange,
		});

		model.emit(`change:${TRAITS.xyzBytes}`);

		expect(three.setPointsFromModel).toHaveBeenCalledTimes(1);
		expect(three.setColorsFromModel).toHaveBeenCalledTimes(1);

		bindings.dispose();
	});
});
