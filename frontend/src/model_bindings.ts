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

	// Coalesce/guard recolor bursts. Trait updates from Python are not atomic;
	// we may briefly observe codedValues and palette out of sync. That must not
	// crash production; we retry once on the next microtask.
	let recolorScheduled = false;
	let recolorRetryArmed = false;

	function isTransientRecolorError(err: unknown): boolean {
		if (!(err instanceof Error)) return false;
		const m = err.message;
		return (
			m.startsWith("No color for code=") ||
			m.startsWith("coded_values_t length") ||
			m.startsWith('active_category_t="') || // active not found in labels
			m.includes("not found in labels_t")
		);
	}

	function tryRecolorStrict(): boolean {
		try {
			three.setColorsFromModel();
			three.setSizesFromModel();
			return true;
		} catch (err) {
			if (isTransientRecolorError(err)) return false;
			throw err;
		}
	}

	function scheduleRecolor() {
		if (recolorScheduled) return;
		recolorScheduled = true;

		queueMicrotask(() => {
			recolorScheduled = false;

			const ok = tryRecolorStrict();
			if (ok) {
				recolorRetryArmed = false;
				return;
			}

			if (!recolorRetryArmed) {
				recolorRetryArmed = true;
				scheduleRecolor();
			} else {
				recolorRetryArmed = false;
				console.warn(
					"[bindings] transient recolor mismatch did not converge after retry; skipping",
				);
			}
		});
	}

	function recolorNowOrRetry() {
		const ok = tryRecolorStrict();
		if (!ok) scheduleRecolor();
	}

	const onXYZChange = () => {
		three.setPointsFromModel();
		// points changed => dependent buffers must be recomputed,
		// but codedValues/palette may arrive non-atomically.
		recolorNowOrRetry();
	};

	const onPointSizeChange = () => {
		three.setSizesFromModel();
	};

	// Legend traits changed: refresh legend UI and recolor points (robust path)
	const onLegendChange = () => {
		refreshLegendUI();
		recolorNowOrRetry();
	};

	// Non-legend changes that still affect point colors (coded values)
	const onCodedValuesChange = () => {
		recolorNowOrRetry();
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
