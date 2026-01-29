import { describe, it, expect, vi } from "vitest";
import { FakeModel } from "./fake_model";
import { createInteractionController } from "../src/interaction_controller";
import { TRAITS } from "../src/model";
import type { InteractionState } from "../src/interaction";
import { createControlBar } from "../src/ui";

describe("lasso commit focus contract", () => {
	it("sends lasso commit when Enter is pressed even if root is not focused (while in lasso mode)", () => {
		const model = new FakeModel() as any;
		model.set(TRAITS.activeCategory, "A");
		model.set(TRAITS.categoryEditable, true);

		const three = {
			selectMaskInLasso: vi.fn(() => new Uint8Array([0x80])),
		} as any;

		const toolbar = document.createElement("div");
		document.body.appendChild(toolbar);

		const cfg: any = {
			controlBar: { gapPx: 0 },
			messages: { marginLeftPx: 0, fontSizePx: 12, color: "#000" },
			buttons: {
				padding: "0",
				borderRadiusPx: 0,
				border: "0",
				font: "system-ui",
				inactiveBg: "#fff",
				inactiveText: "#000",
				activeBg: "#000",
				activeText: "#fff",
				removeActiveBg: "#000",
				removeActiveText: "#fff",
			},
		};

		const bar = createControlBar(toolbar, cfg);

		const root = document.createElement("div");
		const canvas = document.createElement("canvas");

		const state: InteractionState = {
			mode: { kind: "rotate" },
			lasso: { kind: "idle" },
			lastPointer: null,
			dpr: 1,
			pixelWidth: 300,
			pixelHeight: 200,
		} as any;

		const ac = new AbortController();

		createInteractionController({
			model,
			three,
			bar,
			state,
			root,
			canvas,
			syncUiFromState: vi.fn(),
			signal: ac.signal,
			transportReady: () => true,
			showMessage: vi.fn(),
			clearMessage: vi.fn(),
		});

		bar.lassoBtn.click();
		expect(state.mode.kind).toBe("lasso");

		state.lasso = {
			kind: "ready",
			points: [
				{ cssX: 0, cssY: 0, normDevCoordX: -0.5, normDevCoordY: -0.5 },
				{ cssX: 10, cssY: 0, normDevCoordX: 0.5, normDevCoordY: -0.5 },
				{ cssX: 10, cssY: 10, normDevCoordX: 0.5, normDevCoordY: 0.5 },
			],
		};

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

		const keys = (model as any).setCalls.map((c: any) => c.key);
		expect(keys).toContain(TRAITS.lassoMask);
		expect(keys).toContain(TRAITS.lassoRequest);
		expect((model as any).saveCalls).toBeGreaterThanOrEqual(2);
		expect(three.selectMaskInLasso).toHaveBeenCalledTimes(1);

		ac.abort();
	});

	it("does not send lasso commit on Enter when not in lasso mode", () => {
		const model = new FakeModel() as any;
		model.set(TRAITS.activeCategory, "A");
		model.set(TRAITS.categoryEditable, true);

		const three = {
			selectMaskInLasso: vi.fn(() => new Uint8Array([0x80])),
		} as any;

		const toolbar = document.createElement("div");
		document.body.appendChild(toolbar);

		const cfg: any = {
			controlBar: { gapPx: 0 },
			messages: { marginLeftPx: 0, fontSizePx: 12, color: "#000" },
			buttons: {
				padding: "0",
				borderRadiusPx: 0,
				border: "0",
				font: "system-ui",
				inactiveBg: "#fff",
				inactiveText: "#000",
				activeBg: "#000",
				activeText: "#fff",
				removeActiveBg: "#000",
				removeActiveText: "#fff",
			},
		};

		const bar = createControlBar(toolbar, cfg);

		const root = document.createElement("div");
		const canvas = document.createElement("canvas");

		const state: InteractionState = {
			mode: { kind: "rotate" },
			lasso: {
				// even if some stale lasso exists, rotate mode must gate commit
				kind: "ready",
				points: [
					{ cssX: 0, cssY: 0, normDevCoordX: -0.5, normDevCoordY: -0.5 },
					{ cssX: 10, cssY: 0, normDevCoordX: 0.5, normDevCoordY: -0.5 },
					{ cssX: 10, cssY: 10, normDevCoordX: 0.5, normDevCoordY: 0.5 },
				],
			},
			lastPointer: null,
			dpr: 1,
			pixelWidth: 300,
			pixelHeight: 200,
		} as any;

		const ac = new AbortController();

		createInteractionController({
			model,
			three,
			bar,
			state,
			root,
			canvas,
			syncUiFromState: vi.fn(),
			signal: ac.signal,
			transportReady: () => true,
			showMessage: vi.fn(),
			clearMessage: vi.fn(),
		});

		// Enter pressed globally, but mode is rotate
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

		const keys = (model as any).setCalls.map((c: any) => c.key);
		expect(keys).not.toContain(TRAITS.lassoMask);
		expect(keys).not.toContain(TRAITS.lassoRequest);
		expect(three.selectMaskInLasso).not.toHaveBeenCalled();

		ac.abort();
	});
});
