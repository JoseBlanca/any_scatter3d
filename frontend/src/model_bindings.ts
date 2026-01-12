import type { WidgetModel } from "./model";
import { TRAITS, changeEvent } from "./model";
import type { ThreeScene } from "./three_scene";

export type ModelBindingsDeps = {
	model: WidgetModel;
	three: ThreeScene;

	// invoked when legend-related traits change
	refreshLegendUI: () => void;

	// tooltip response handler
	onTooltipResponseChange: () => void;
};

export function bindModelToView(deps: ModelBindingsDeps): {
	dispose: () => void;
} {
	const { model, three, refreshLegendUI, onTooltipResponseChange } = deps;

	const onXYZChange = () => {
		three.setPointsFromModel();
		// points changed => dependent buffers must be recomputed
		three.setColorsFromModel();
		three.setSizesFromModel();
	};

	const onPointSizeChange = () => {
		three.setSizesFromModel();
	};

	// Legend traits changed: refresh legend UI and recolor points (robust path)
	const onLegendChange = () => {
		refreshLegendUI();
		three.setColorsFromModel();
		three.setSizesFromModel();
	};

	// Non-legend changes that still affect point colors (coded values)
	const onCodedValuesChange = () => {
		three.setColorsFromModel();
		three.setSizesFromModel();
	};

	const onLassoResultChange = () => {
		const res = model.get(TRAITS.lassoResult);
		if (!res) return;
		if (res.status === "error") console.error("Lasso error:", res.message);
	};

	function axesVisible(): boolean {
		return model.get(TRAITS.showAxes) === true;
	}

	const onShowAxesChange = () => {
		three.setAxesFromModel();
		if (axesVisible()) three.rebuildAxisLabels?.();
	};

	const onAxisLabelSizeChange = () => {
		if (!axesVisible()) return;
		three.rebuildAxisLabels?.();
	};

	// Wire events
	model.on(changeEvent(TRAITS.tooltipResponse), onTooltipResponseChange);
	model.on(changeEvent(TRAITS.xyzBytes), onXYZChange);
	model.on(changeEvent(TRAITS.pointSize), onPointSizeChange);

	// Colors depend on codedValues but legend does not
	model.on(changeEvent(TRAITS.codedValues), onCodedValuesChange);

	// Legend-related traits (also recolor points for robustness)
	model.on(changeEvent(TRAITS.labels), onLegendChange);
	model.on(changeEvent(TRAITS.colors), onLegendChange);
	model.on(changeEvent(TRAITS.missingColor), onLegendChange);

	model.on(changeEvent(TRAITS.showAxes), onShowAxesChange);
	model.on(changeEvent(TRAITS.axisLabelSize), onAxisLabelSizeChange);
	model.on(changeEvent(TRAITS.lassoResult), onLassoResultChange);

	model.on(changeEvent(TRAITS.activeCategory), onLegendChange);

	return {
		dispose: () => {
			model.off(changeEvent(TRAITS.tooltipResponse), onTooltipResponseChange);
			model.off(changeEvent(TRAITS.xyzBytes), onXYZChange);
			model.off(changeEvent(TRAITS.pointSize), onPointSizeChange);
			model.off(changeEvent(TRAITS.codedValues), onCodedValuesChange);
			model.off(changeEvent(TRAITS.labels), onLegendChange);
			model.off(changeEvent(TRAITS.colors), onLegendChange);
			model.off(changeEvent(TRAITS.missingColor), onLegendChange);
			model.off(changeEvent(TRAITS.showAxes), onShowAxesChange);
			model.off(changeEvent(TRAITS.axisLabelSize), onAxisLabelSizeChange);
			model.off(changeEvent(TRAITS.lassoResult), onLassoResultChange);
			model.off(changeEvent(TRAITS.activeCategory), onLegendChange);
		},
	};
}
