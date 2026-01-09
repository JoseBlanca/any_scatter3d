import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildWidget } from "../src/index";
import type { WidgetModel } from "../src/model";

vi.mock("../src/three_scene", () => ({
	createThreeScene: () => {
		const domElement = document.createElement("canvas");
		return {
			domElement,
			setPointsFromModel: vi.fn(),
			setColorsFromModel: vi.fn(),
			setAxesFromModel: vi.fn(),
			render: vi.fn(),
			dispose: vi.fn(),
			selectMaskInLasso: vi.fn(() => new Uint8Array([255])),
			setSize: vi.fn(),
		};
	},
}));

vi.mock("../src/raf_controller", () => ({
	createRafController: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

vi.mock("../src/model_bindings", () => ({
	bindModelToView: () => ({ dispose: vi.fn() }),
}));

vi.mock("../src/tooltip_controller", () => ({
	createTooltipController: () => ({
		dispose: vi.fn(),
		onTooltipResponseChange: vi.fn(),
	}),
}));

vi.mock("../src/labels_controller", () => ({
	createLabelsController: () => ({ refresh: vi.fn(), dispose: vi.fn() }),
}));

function makeNonInteractiveModel(): WidgetModel {
	return {
		get: () => undefined,
		set: () => {},
		save_changes: () => undefined,
		on: () => {},
		off: () => {},
	} as any;
}

describe("lasso transport warning UX", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("clicking Lasso when transport is not ready shows warning and stays in rotate mode", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);

		// This is the key: no comm/transport fields on widget_manager.
		const model = makeNonInteractiveModel() as any;
		model.widget_manager = {}; // matches what we observed on marimo initial load

		const h = buildWidget(model, el, { startRaf: false });

		const lassoBtn = h.root.querySelector(
			'[data-testid="mode-lasso"]',
		) as HTMLButtonElement;
		expect(lassoBtn).toBeTruthy();

		// Initial is rotate mode: overlay should not receive pointer events
		expect(getComputedStyle(h.overlayCanvas).pointerEvents).toBe("none");

		// Click lasso: should NOT enter lasso mode; should show warning
		lassoBtn.click();

		const msgEl = h.root.querySelector(
			'[data-testid="ui-message"]',
		) as HTMLElement;
		expect(msgEl).toBeTruthy();
		expect(msgEl.textContent ?? "").toMatch(/not interactive/i);
		expect(getComputedStyle(msgEl).display).not.toBe("none");

		// Still rotate routing
		expect(getComputedStyle(h.overlayCanvas).pointerEvents).toBe("none");

		h.cleanup();
	});
});
