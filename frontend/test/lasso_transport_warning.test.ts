// test/lasso_transport_warning.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeModel } from "./fake_model";
import { createInteractionState } from "../src/interaction";
import { createInteractionController } from "../src/interaction_controller";
import { TRAITS } from "../src/model";
import { createControlBar } from "../src/ui";

function makeBar() {
	return {
		rotateBtn: document.createElement("button"),
		lassoBtn: document.createElement("button"),
		addBtn: document.createElement("button"),
		removeBtn: document.createElement("button"),
	} as any;
}

describe("interaction_controller: lasso transport warning", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("clicking Lasso when transport is not ready shows warning and does not set interaction_mode_t", () => {
		// DOM
		const root = document.createElement("div");
		const canvas = document.createElement("canvas");
		root.appendChild(canvas);
		document.body.appendChild(root);

		// Model: starts in rotate
		const model = new FakeModel();
		model.set(TRAITS.interactionMode, "rotate");
		model.set(TRAITS.activeCategory, "");
		model.set(TRAITS.categoryEditable, true);

		// State (size irrelevant for this test, but keep invariants sane)
		const state = createInteractionState();
		state.dpr = 1;
		state.pixelWidth = 400;
		state.pixelHeight = 300;

		// Minimal deps
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

		const syncUiFromState = vi.fn();

		const showMessage = vi.fn();
		const clearMessage = vi.fn();

		createInteractionController({
			model: model as any,
			three: { selectMaskInLasso: vi.fn() } as any,
			bar,
			state,
			root,
			canvas,
			syncUiFromState,
			signal: new AbortController().signal,
			transportReady: () => false,
			showMessage,
			clearMessage,
		});

		// Snapshot BEFORE click (constructor may set initial mode)
		const prevSetCalls = model.setCalls.length;
		const prevSaveCalls = model.saveCalls;
		const prevClearCalls = clearMessage.mock.calls.length;

		// Act: user clicks lasso
		bar.lassoBtn.click();

		// Assert: warning shown
		expect(showMessage).toHaveBeenCalledTimes(1);
		expect(String(showMessage.mock.calls[0][0])).toMatch(/not interactive/i);

		// Assert: no additional trait write for interaction mode caused by the click
		const newCalls = model.setCalls.slice(prevSetCalls);
		expect(newCalls.some((c) => c.key === TRAITS.interactionMode)).toBe(false);

		// And no save_changes caused by the click
		expect(model.saveCalls).toBe(prevSaveCalls);

		// clearMessage should not be called by the click (early-return before it)
		expect(clearMessage.mock.calls.length).toBe(prevClearCalls);
	});
});
