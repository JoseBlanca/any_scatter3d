import { describe, it, expect, vi } from "vitest";
import { FakeModel } from "./fake_model";
import { bindModelToView } from "../src/model_bindings";
import { TRAITS } from "../src/model";

function makeThreeStub() {
	return {
		setPointsFromModel: vi.fn(),
		setColorsFromModel: vi.fn(),
		setSizesFromModel: vi.fn(),
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

	it("does not crash on transient labels/colors mismatch when refreshLegendUI is safe (production wiring)", () => {
		const model = new FakeModel();
		const three = makeThreeStub();

		// This simulates the SAFE refresh function that production should wire:
		// it must tolerate transient mismatch and simply skip until consistent.
		const safeRefreshLegendUI = () => {
			const labels = model.get(TRAITS.labels) as unknown;
			const colors = model.get(TRAITS.colors) as unknown;

			// If not ready or temporarily inconsistent, do nothing.
			if (!Array.isArray(labels) || !Array.isArray(colors)) return;
			if (labels.length !== colors.length) return;

			// If consistent, "refresh" would proceed. We don't need to assert DOM here;
			// the binding contract is: no crash + downstream recolor calls still run.
		};

		const bindings = bindModelToView({
			model: model as any,
			three,
			refreshLegendUI: safeRefreshLegendUI,
			onTooltipResponseChange: () => {},
		});

		// Start consistent (category A)
		model.set(TRAITS.labels, ["a", "b", "c"]);
		model.set(TRAITS.colors, [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]);

		// Simulate category switch burst:
		// colors from old category (len 6) still present, but labels updated first (len 3)
		model.set(TRAITS.colors, [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
			[1, 1, 0],
			[1, 0, 1],
			[0, 1, 1],
		]);
		model.set(TRAITS.labels, ["x", "y", "z"]);

		// Must not throw.
		expect(() => model.emit(`change:${TRAITS.labels}`)).not.toThrow();

		// And the robust recolor path still runs.
		expect(three.setColorsFromModel).toHaveBeenCalledTimes(1);
		expect(three.setSizesFromModel).toHaveBeenCalledTimes(1);

		bindings.dispose();
	});
});
