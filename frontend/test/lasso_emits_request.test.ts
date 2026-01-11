// test/lasso_emits_request.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeModel } from "./fake_model";
import { createInteractionState } from "../src/interaction";
import { createInteractionController } from "../src/interaction_controller";
import { TRAITS, type LassoRequest } from "../src/model";

// Helper to dispatch pointer events
function pe(
	type: string,
	target: HTMLElement,
	props: Partial<PointerEventInit> = {},
) {
	const ev = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		pointerId: 1,
		pointerType: "mouse",
		buttons: 1,
		clientX: 50,
		clientY: 50,
		...props,
	});
	target.dispatchEvent(ev);
}

function key(target: HTMLElement, k: string) {
	target.dispatchEvent(
		new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: k }),
	);
}

function makeRect(w: number, h: number) {
	return {
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: w,
		bottom: h,
		width: w,
		height: h,
		toJSON() {},
	} as any;
}

function makeBar() {
	// Minimal ControlBar: just the buttons that interaction_controller uses.
	// No UI/UX behavior changes, just test scaffolding.
	return {
		rotateBtn: document.createElement("button"),
		lassoBtn: document.createElement("button"),
		addBtn: document.createElement("button"),
		removeBtn: document.createElement("button"),
	} as any;
}

describe("interaction_controller: lasso commit emits model request", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		Object.defineProperty(window, "devicePixelRatio", {
			value: 1,
			configurable: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("emits lasso_mask_t and lasso_request_t with correct payload after Enter", () => {
		// DOM
		const root = document.createElement("div");
		const canvas = document.createElement("canvas");
		root.appendChild(canvas);
		document.body.appendChild(root);

		// Stable geometry: pointerInfoFromEvent depends on getBoundingClientRect
		vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() =>
			makeRect(400, 300),
		);

		// jsdom may not implement pointer capture; keep controller quiet
		Object.defineProperty(canvas, "setPointerCapture", {
			value: vi.fn(),
			configurable: true,
		});

		// Model
		const model = new FakeModel();
		model.set(TRAITS.activeCategory, "testlabel");
		model.set(TRAITS.interactionMode, "lasso");

		// ThreeScene stub: controller calls selectMaskInLasso(polygonNdc)
		const selectMaskInLasso = vi.fn(() => new Uint8Array([255]));
		const three = { selectMaskInLasso } as any;

		// State: controller refuses pointerdown unless size is > 0
		const state = createInteractionState();
		state.dpr = 1;
		state.pixelWidth = 400;
		state.pixelHeight = 300;

		// Bar + deps
		const bar = makeBar();
		const syncUiFromState = vi.fn();

		const showMessage = vi.fn();
		const clearMessage = vi.fn();
		const transportReady = () => true;

		const ignores: string[] = [];
		const controller = createInteractionController({
			model: model as any,
			three,
			bar,
			state,
			root,
			canvas,
			syncUiFromState,
			signal: new AbortController().signal,
			transportReady,
			showMessage,
			clearMessage,
			debug: { onIgnoreLasso: (r) => ignores.push(r) },
		});

		// Put controller into lasso mode the *same way the user does* (button click).
		// This also sets local state.operation = "add".
		bar.lassoBtn.click();

		// Draw a 3-point lasso
		pe("pointerdown", canvas, { clientX: 10, clientY: 10, buttons: 1 });
		pe("pointermove", canvas, { clientX: 20, clientY: 20, buttons: 1 });
		pe("pointermove", canvas, { clientX: 30, clientY: 10, buttons: 1 });
		pe("pointerup", canvas, { clientX: 30, clientY: 10, buttons: 0 });

		// Commit via Enter (user-facing behavior)
		key(root, "Enter");

		// No ignores, no warning messages
		expect(ignores).toEqual([]);
		expect(showMessage).not.toHaveBeenCalled();

		// Polygon should have been used to generate mask
		expect(selectMaskInLasso).toHaveBeenCalledTimes(1);
		expect(selectMaskInLasso.mock.calls[0][0]).toEqual([
			// We only care about order + NDC mapping; NDC comes from pointerInfoFromEvent.
			// With rect 400x300:
			// (10,10) => x=10/400=0.025 => ndc=-0.95 ; y=10/300=0.0333 => ndc=+0.9333
			// etc.
			{ x: -0.95, y: 0.9333333333333333 },
			{ x: -0.9, y: 0.8666666666666667 },
			{ x: -0.85, y: 0.9333333333333333 },
		]);

		// Model writes: mask then request then save_changes
		const setKeys = model.setCalls.map((c) => c.key);
		expect(setKeys).toContain(TRAITS.lassoMask);
		expect(setKeys).toContain(TRAITS.lassoRequest);
		expect(model.saveCalls).toBeGreaterThan(0);

		// Mask is binary bytes (DataView) for [255]
		const maskSet = model.setCalls.find((c) => c.key === TRAITS.lassoMask);
		expect(maskSet).toBeTruthy();

		const v = maskSet!.value;

		// In jsdom/vitest the widget stack isn't involved; we set DataView directly.
		expect(v).toBeInstanceOf(DataView);

		const dv = v as DataView;
		expect(dv.byteLength).toBe(1);
		expect(dv.getUint8(0)).toBe(255);

		// Request payload is strict and correct
		const reqSet = model.setCalls.find((c) => c.key === TRAITS.lassoRequest);
		expect(reqSet?.value).toEqual<LassoRequest>({
			kind: "lasso_commit",
			op: "add",
			label: "testlabel",
			request_id: 1,
		});

		controller.dispose();
	});

	it("does not emit when selectMaskInLasso returns empty; records ignore reason", () => {
		const root = document.createElement("div");
		const canvas = document.createElement("canvas");
		root.appendChild(canvas);
		document.body.appendChild(root);

		vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() =>
			makeRect(400, 300),
		);

		Object.defineProperty(canvas, "setPointerCapture", {
			value: vi.fn(),
			configurable: true,
		});

		const model = new FakeModel();
		model.set(TRAITS.activeCategory, "testlabel");
		model.set(TRAITS.interactionMode, "lasso");

		const three = { selectMaskInLasso: vi.fn(() => new Uint8Array()) } as any;

		const state = createInteractionState();
		state.dpr = 1;
		state.pixelWidth = 400;
		state.pixelHeight = 300;

		const bar = makeBar();
		const syncUiFromState = vi.fn();

		const ignores: string[] = [];
		createInteractionController({
			model: model as any,
			three,
			bar,
			state,
			root,
			canvas,
			syncUiFromState,
			signal: new AbortController().signal,
			transportReady: () => true,
			showMessage: vi.fn(),
			clearMessage: vi.fn(),
			debug: { onIgnoreLasso: (r) => ignores.push(r) },
		});

		bar.lassoBtn.click();

		pe("pointerdown", canvas, { clientX: 10, clientY: 10, buttons: 1 });
		pe("pointermove", canvas, { clientX: 20, clientY: 20, buttons: 1 });
		pe("pointermove", canvas, { clientX: 30, clientY: 10, buttons: 1 });
		pe("pointerup", canvas, { clientX: 30, clientY: 10, buttons: 0 });

		key(root, "Enter");

		const setKeys = model.setCalls.map((c) => c.key);
		expect(setKeys).not.toContain(TRAITS.lassoMask);
		expect(setKeys).not.toContain(TRAITS.lassoRequest);

		expect(ignores).toContain("empty-mask");
	});
});
