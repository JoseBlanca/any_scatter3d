// frontend/test/lasso_emits_request.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeModel } from "./fake_model";

// Keep these mocks (avoid WebGL/RAF complexity)
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
			selectMaskInLasso: vi.fn(() => new Uint8Array([255])), // non-empty
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
	createLabelsController: () => ({ refresh: vi.fn() }),
}));

// NOTE: do NOT mock interaction_controller or resize_controller here; we want real logic.
import { buildWidget } from "../src/index";

// Helper to dispatch pointer events in jsdom
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

function ensureLabelSelected(root: HTMLElement) {
	const sel = root.querySelector(
		'[data-testid="label-select"]',
	) as HTMLSelectElement | null;
	if (!sel)
		throw new Error("Missing [data-testid=label-select] on label select");

	if (sel.options.length === 0) {
		sel.add(new Option("testlabel", "testlabel"));
	}

	const first = sel.options.item(0);
	if (!first || !first.value) {
		throw new Error("label-select has no usable option value");
	}

	sel.value = first.value;
	sel.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickLasso(root: HTMLElement) {
	const btn =
		(root.querySelector(
			'[data-testid="mode-lasso"]',
		) as HTMLButtonElement | null) ??
		Array.from(root.querySelectorAll("button")).find((b) =>
			(b.textContent ?? "").toLowerCase().includes("lasso"),
		);

	if (!btn)
		throw new Error(
			"Could not find lasso button (add data-testid='mode-lasso')",
		);
	btn.click();
}

describe("lasso emits request", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("emits lasso_request_t after drawing and pressing Enter", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);

		const model = new FakeModel();
		// Mark transport as ready for the UX gate.
		(model as any).widget_manager = { comm: {} };

		const h = buildWidget(model as any, el, { startRaf: false });

		// Ensure canvas has a real rect so pointerInfoFromEvent sets isInside=true
		vi.spyOn(h.overlayCanvas, "getBoundingClientRect").mockImplementation(
			() =>
				({
					x: 0,
					y: 0,
					left: 0,
					top: 0,
					right: 400,
					bottom: 300,
					width: 400,
					height: 300,
					toJSON() {},
				}) as any,
		);

		// Switch to lasso mode and select a label
		clickLasso(h.root);
		ensureLabelSelected(h.root);

		expect(getComputedStyle(h.overlayCanvas).pointerEvents).toBe("auto");

		// Draw a gesture
		pe("pointerdown", h.overlayCanvas, {
			clientX: 10,
			clientY: 10,
			buttons: 1,
		});
		pe("pointermove", h.overlayCanvas, {
			clientX: 20,
			clientY: 20,
			buttons: 1,
		});
		pe("pointermove", h.overlayCanvas, {
			clientX: 30,
			clientY: 10,
			buttons: 1,
		});
		pe("pointerup", h.overlayCanvas, { clientX: 30, clientY: 10, buttons: 0 });

		// Commit happens on Enter
		key(h.root, "Enter");

		const setKeys = model.setCalls.map((c) => c.key);

		// These are the contract of the lasso commit.
		expect(setKeys).toContain("lasso_mask_t");
		expect(setKeys).toContain("lasso_request_t");

		expect(model.saveCalls).toBeGreaterThan(0);

		h.cleanup();
	});

	it("does not emit when canvas is 0×0; emits after forceResize makes it non-zero", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);

		const model = new FakeModel();
		// Mark transport as ready for the UX gate.
		(model as any).widget_manager = { comm: {} };

		const h = buildWidget(model as any, el, { startRaf: false });

		// Lasso mode + label chosen
		clickLasso(h.root);
		ensureLabelSelected(h.root);

		// Overlay rect: first 0×0 (outside), then valid (inside)
		let call = 0;
		vi.spyOn(h.overlayCanvas, "getBoundingClientRect").mockImplementation(
			() => {
				call += 1;
				if (call === 1) {
					return {
						x: 0,
						y: 0,
						left: 0,
						top: 0,
						right: 0,
						bottom: 0,
						width: 0,
						height: 0,
						toJSON() {},
					} as any;
				}
				return {
					x: 0,
					y: 0,
					left: 0,
					top: 0,
					right: 400,
					bottom: 300,
					width: 400,
					height: 300,
					toJSON() {},
				} as any;
			},
		);

		// Before resize: pointerdown is outside; Enter should NOT produce lasso traits.
		pe("pointerdown", h.overlayCanvas, {
			clientX: 10,
			clientY: 10,
			buttons: 1,
		});
		pe("pointerup", h.overlayCanvas, { clientX: 20, clientY: 20, buttons: 0 });
		key(h.root, "Enter");

		const keysPre = model.setCalls.map((c) => c.key);
		expect(keysPre).not.toContain("lasso_mask_t");
		expect(keysPre).not.toContain("lasso_request_t");

		// Now simulate layout becoming valid (without rerender)
		vi.spyOn(h.canvasHost, "getBoundingClientRect").mockImplementation(
			() =>
				({
					x: 0,
					y: 0,
					left: 0,
					top: 0,
					right: 400,
					bottom: 300,
					width: 400,
					height: 300,
					toJSON() {},
				}) as any,
		);

		h.forceResize();

		// After resize: gesture + Enter should emit lasso
		pe("pointerdown", h.overlayCanvas, {
			clientX: 10,
			clientY: 10,
			buttons: 1,
		});
		pe("pointermove", h.overlayCanvas, {
			clientX: 20,
			clientY: 20,
			buttons: 1,
		});
		pe("pointermove", h.overlayCanvas, {
			clientX: 30,
			clientY: 10,
			buttons: 1,
		});
		pe("pointerup", h.overlayCanvas, { clientX: 30, clientY: 10, buttons: 0 });
		key(h.root, "Enter");

		const setKeys = model.setCalls.map((c) => c.key);
		expect(setKeys).toContain("lasso_mask_t");
		expect(setKeys).toContain("lasso_request_t");
		expect(model.saveCalls).toBeGreaterThan(0);

		h.cleanup();
	});
});
