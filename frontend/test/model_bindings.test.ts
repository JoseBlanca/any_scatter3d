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

	it("does not crash on transient codedValues/palette mismatch and retries", async () => {
		const model = new FakeModel();

		// Three stub that reproduces the *real* failure mode:
		// throw if max code exceeds palette length.
		const three = makeThreeStub();
		three.setColorsFromModel = vi.fn(() => {
			const colors = model.get(TRAITS.colors) as unknown;
			const codes = model.get(TRAITS.codedValues) as unknown;

			if (!Array.isArray(colors)) {
				throw new Error("colors_t must be an array");
			}
			if (!(codes instanceof Uint16Array)) {
				throw new Error("coded_values_t must be Uint16Array in test");
			}

			const paletteLen = colors.length;
			let maxCode = 0;
			for (let i = 0; i < codes.length; i++) {
				if (codes[i] > maxCode) maxCode = codes[i];
			}
			if (maxCode > paletteLen) {
				throw new Error(
					`No color for code=${maxCode} (palette length=${paletteLen}); expected palette[${maxCode - 1}]`,
				);
			}
		});

		three.setSizesFromModel = vi.fn(() => {
			// mimic a strict size path too (same code range issue can exist)
			const colors = model.get(TRAITS.colors) as unknown;
			const codes = model.get(TRAITS.codedValues) as unknown;

			if (!Array.isArray(colors)) throw new Error("colors_t must be an array");
			if (!(codes instanceof Uint16Array)) {
				throw new Error("coded_values_t must be Uint16Array in test");
			}

			const paletteLen = colors.length;
			let maxCode = 0;
			for (let i = 0; i < codes.length; i++) {
				if (codes[i] > maxCode) maxCode = codes[i];
			}
			if (maxCode > paletteLen) {
				throw new Error(
					`No size for code=${maxCode} (palette length=${paletteLen})`,
				);
			}
		});

		const bindings = bindModelToView({
			model: model as any,
			three,
			refreshLegendUI: vi.fn(),
			onTooltipResponseChange: vi.fn(),
		});

		// Start with palette length 3
		model.set(TRAITS.colors, [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]);

		// Transient state: coded values include code=4 (needs palette length >= 4)
		model.set(TRAITS.codedValues, new Uint16Array([1, 4, 2]));

		// This is the bug: recolor triggered while inconsistent must not crash.
		expect(() => model.emit(`change:${TRAITS.labels}`)).not.toThrow();

		// Now "next update" arrives: palette becomes length 4
		model.set(TRAITS.colors, [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
			[1, 1, 0],
		]);
		expect(() => model.emit(`change:${TRAITS.colors}`)).not.toThrow();

		// Allow any scheduled retry to run
		await Promise.resolve();
		await Promise.resolve();

		expect(three.setColorsFromModel).toHaveBeenCalled();
		expect(three.setSizesFromModel).toHaveBeenCalled();

		bindings.dispose();
	});
	it("repro: editable->non-editable switch can skip recolor if active_category_t is stale (not in labels_t)", async () => {
		const model = new FakeModel();

		// Strict-ish three stub that mimics the failure mode in three_scene.setColorsFromModel:
		// throw if active_category_t is not in labels_t.
		const three = {
			setPointsFromModel: vi.fn(),
			setAxesFromModel: vi.fn(),
			rebuildAxisLabels: vi.fn(),
			setColorsFromModel: vi.fn(() => {
				const active = model.get(TRAITS.activeCategory);
				const labelsRaw = model.get(TRAITS.labels);

				if (active === null || active === undefined) return;
				if (typeof active !== "string") {
					throw new Error(
						`active_category_t must be string|null|undefined, got ${typeof active}`,
					);
				}
				if (!Array.isArray(labelsRaw)) {
					throw new Error(
						`labels_t must be an array when active_category_t is set`,
					);
				}

				const labels = labelsRaw.map((v) => String(v));
				if (!labels.includes(active)) {
					// IMPORTANT: this exact prefix is what bindModelToView classifies as transient
					throw new Error(
						`active_category_t="${active}" not found in labels_t`,
					);
				}
			}),
			setSizesFromModel: vi.fn(() => {
				// Mirror the same strictness; bindings call sizes right after colors.
				const active = model.get(TRAITS.activeCategory);
				const labelsRaw = model.get(TRAITS.labels);

				if (active === null || active === undefined) return;
				if (typeof active !== "string")
					throw new Error(`active_category_t must be string|null`);
				if (!Array.isArray(labelsRaw))
					throw new Error(
						`labels_t must be array when active_category_t is set`,
					);

				const labels = labelsRaw.map((v) => String(v));
				if (!labels.includes(active)) {
					throw new Error(
						`active_category_t="${active}" not found in labels_t`,
					);
				}
			}),
		} as any;

		const refreshLegendUI = vi.fn();
		const bindings = bindModelToView({
			model: model as any,
			three,
			refreshLegendUI,
			onTooltipResponseChange: vi.fn(),
		});

		// Initial state: editable category with a valid active label
		model.set(TRAITS.labels, ["a", "b"]);
		model.set(TRAITS.activeCategory, "a");

		// Spy on warning emitted after retries fail
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		// Switch to a non-editable category, but (buggy) active_category_t remains "a"
		// while labels_t becomes ["x","y"]. This should cause recolor to fail and then be skipped.
		model.set(TRAITS.labels, ["x", "y"]);
		model.emit(`change:${TRAITS.labels}`);

		// Let the scheduled retries run (queueMicrotask). Two awaits is enough with this harness.
		await Promise.resolve();
		await Promise.resolve();

		// What we want to capture:
		// - legend refresh ran (user sees legend update)
		expect(refreshLegendUI).toHaveBeenCalledTimes(1);

		// - recolor was attempted (immediate + 2 microtask retries = 3 calls)
		// setColorsFromModel throws (stale active label), so setSizesFromModel is never reached.
		// We expect 1 immediate attempt + 2 retries = 3 total calls.
		expect(three.setColorsFromModel).toHaveBeenCalledTimes(3);
		expect(three.setSizesFromModel).toHaveBeenCalledTimes(0);

		// - after failing to converge, bindings warned and skipped (user sees stale colors)
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain(
			"transient recolor mismatch did not converge",
		);

		warn.mockRestore();
		bindings.dispose();
	});
});
