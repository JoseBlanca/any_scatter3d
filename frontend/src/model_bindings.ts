import type { WidgetModel } from "./model";
import { TRAITS } from "./model";
import type { createThreeScene } from "./three_scene";

export type ModelBindingsDeps = {
	model: WidgetModel;
	three: ReturnType<typeof createThreeScene>;

	// invoked when labels trait changes
	refreshLabelsUI: () => void;

	// tooltip response handler (kept separate; Step 2 will own it)
	onTooltipResponseChange: () => void;
};

export function bindModelToView(deps: ModelBindingsDeps): {
	dispose: () => void;
} {
	const { model, three, refreshLabelsUI, onTooltipResponseChange } = deps;

	const onXYZChange = () => {
		three.setPointsFromModel();
		three.setColorsFromModel();
	};

	const onColorsRelatedChange = () => {
		three.setColorsFromModel();
	};

	const onLabelsChange = () => {
		refreshLabelsUI();
		three.setColorsFromModel();
	};

	const onLassoResultChange = () => {
		const res = model.get(TRAITS.lassoResult);
		if (!res) return;

		if (res.status === "error") {
			console.error("Lasso error:", res.message);
		}
	};

	const onShowAxesChange = () => {
		three.setAxesFromModel();
		if (model.get(TRAITS.showAxes) === true) {
			three.rebuildAxisLabels?.();
		}
	};

	const onAxisLabelSizeChange = () => {
		if (model.get(TRAITS.showAxes) !== true) return;
		three.rebuildAxisLabels?.();
	};

	model.on(`change:${TRAITS.tooltipResponse}`, onTooltipResponseChange);
	model.on(`change:${TRAITS.xyzBytes}`, onXYZChange);
	model.on(`change:${TRAITS.codedValues}`, onColorsRelatedChange);
	model.on(`change:${TRAITS.colors}`, onColorsRelatedChange);
	model.on(`change:${TRAITS.showAxes}`, onShowAxesChange);
	model.on(`change:${TRAITS.missingColor}`, onColorsRelatedChange);
	model.on(`change:${TRAITS.labels}`, onLabelsChange);
	model.on(`change:${TRAITS.lassoResult}`, onLassoResultChange);
	model.on(`change:${TRAITS.axisLabelSize}`, onAxisLabelSizeChange);

	return {
		dispose: () => {
			model.off(`change:${TRAITS.xyzBytes}`, onXYZChange);
			model.off(`change:${TRAITS.codedValues}`, onColorsRelatedChange);
			model.off(`change:${TRAITS.colors}`, onColorsRelatedChange);
			model.off(`change:${TRAITS.missingColor}`, onColorsRelatedChange);
			model.off(`change:${TRAITS.labels}`, onLabelsChange);
			model.off(`change:${TRAITS.lassoResult}`, onLassoResultChange);
			model.off(`change:${TRAITS.showAxes}`, onShowAxesChange);
			model.off(`change:${TRAITS.axisLabelSize}`, onAxisLabelSizeChange);
			model.off(`change:${TRAITS.tooltipResponse}`, onTooltipResponseChange);
		},
	};
}
