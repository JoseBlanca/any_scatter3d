import type { WidgetModel } from "./model";
import { TRAITS } from "./model";
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
		// safe + robust: points changed => colors need reapply
		three.setColorsFromModel();
	};

	// Legend traits changed: refresh legend UI and recolor points (robust path)
	const onLegendChange = () => {
		refreshLegendUI();
		three.setColorsFromModel();
	};

	// Non-legend changes that still affect point colors (coded values)
	const onCodedValuesChange = () => {
		three.setColorsFromModel();
	};

	const onLassoResultChange = () => {
		const res = model.get(TRAITS.lassoResult);
		if (!res) return;
		if (res.status === "error") console.error("Lasso error:", res.message);
	};

	const onShowAxesChange = () => {
		three.setAxesFromModel();
		if (model.get(TRAITS.showAxes) === true) three.rebuildAxisLabels?.();
	};

	const onAxisLabelSizeChange = () => {
		if (model.get(TRAITS.showAxes) !== true) return;
		three.rebuildAxisLabels?.();
	};

	// Wire events
	model.on(`change:${TRAITS.tooltipResponse}`, onTooltipResponseChange);

	model.on(`change:${TRAITS.xyzBytes}`, onXYZChange);

	// Colors depend on codedValues but legend does not
	model.on(`change:${TRAITS.codedValues}`, onCodedValuesChange);

	// Legend-related traits (also recolor points for robustness)
	model.on(`change:${TRAITS.labels}`, onLegendChange);
	model.on(`change:${TRAITS.colors}`, onLegendChange);
	model.on(`change:${TRAITS.missingColor}`, onLegendChange);

	model.on(`change:${TRAITS.showAxes}`, onShowAxesChange);
	model.on(`change:${TRAITS.axisLabelSize}`, onAxisLabelSizeChange);
	model.on(`change:${TRAITS.lassoResult}`, onLassoResultChange);

	return {
		dispose: () => {
			model.off(`change:${TRAITS.tooltipResponse}`, onTooltipResponseChange);

			model.off(`change:${TRAITS.xyzBytes}`, onXYZChange);

			model.off(`change:${TRAITS.codedValues}`, onCodedValuesChange);

			model.off(`change:${TRAITS.labels}`, onLegendChange);
			model.off(`change:${TRAITS.colors}`, onLegendChange);
			model.off(`change:${TRAITS.missingColor}`, onLegendChange);

			model.off(`change:${TRAITS.showAxes}`, onShowAxesChange);
			model.off(`change:${TRAITS.axisLabelSize}`, onAxisLabelSizeChange);
			model.off(`change:${TRAITS.lassoResult}`, onLassoResultChange);
		},
	};
}
