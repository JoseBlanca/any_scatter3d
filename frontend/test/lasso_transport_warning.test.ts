// test/lasso_transport_warning.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeModel } from "./fake_model";
import { createInteractionState } from "../src/interaction";
import { createInteractionController } from "../src/interaction_controller";
import { TRAITS } from "../src/model";

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

		// State (size irrelevant for this test, but keep invariants sane)
		const state = createInteractionState();
		state.dpr = 1;
		state.pixelWidth = 400;
		state.pixelHeight = 300;

		// Minimal deps
		const bar = makeBar();
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

		// Act: user clicks lasso
		bar.lassoBtn.click();

		// Assert: warning shown
		expect(showMessage).toHaveBeenCalledTimes(1);
		expect(String(showMessage.mock.calls[0][0])).toMatch(/not interactive/i);

		const prevSetCalls = model.setCalls.length;
		const prevSaveCalls = model.saveCalls;

		// Assert: warning shown
		expect(showMessage).toHaveBeenCalledTimes(1);
		expect(String(showMessage.mock.calls[0][0])).toMatch(/not interactive/i);

		// Assert: no additional trait write for interaction mode caused by the click
		const newCalls = model.setCalls.slice(prevSetCalls);
		expect(newCalls.some((c) => c.key === TRAITS.interactionMode)).toBe(false);

		// And no save_changes caused by the click
		expect(model.saveCalls).toBe(prevSaveCalls);

		// clearMessage should not be called because we early-return before it
		expect(clearMessage).not.toHaveBeenCalled();

		// clearMessage should not be called because we early-return before it
		expect(clearMessage).not.toHaveBeenCalled();
	});
});
