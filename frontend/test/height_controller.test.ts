import { describe, it, expect, vi, beforeEach } from "vitest";

// This module does not exist yet — we'll create it next.
// The test will fail until implemented.
import { createHeightController } from "../src/height_controller";

function setRect(el: HTMLElement, w: number, h: number) {
	// JSDOM doesn't compute layout; we control it.
	(el as any).getBoundingClientRect = () => ({
		x: 0,
		y: 0,
		top: 0,
		left: 0,
		right: w,
		bottom: h,
		width: w,
		height: h,
		toJSON() {
			return {
				x: 0,
				y: 0,
				width: w,
				height: h,
				top: 0,
				left: 0,
				right: w,
				bottom: h,
			};
		},
	});
}

describe("height_controller", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("clamps root height to allocated output height; updates on resize", () => {
		// Simulate marimo output container
		const output = document.createElement("div");
		output.dataset.cellRole = "output";
		document.body.appendChild(output);

		// Simulate anywidget host inside output
		const host = document.createElement("div");
		output.appendChild(host);

		// Widget root that we will size
		const root = document.createElement("div");
		host.appendChild(root);

		// Initial allocation is small
		setRect(output, 1000, 500);

		const onApplied = vi.fn();
		const ctrl = createHeightController({
			hostEl: host,
			rootEl: root,
			desiredPx: 800,
			onApplied,
		});

		// First apply clamps to 500 (minus any internal fudge is NOT allowed here;
		// we want exact clamping at this layer).
		ctrl.applyNow();
		expect(root.style.height).toBe("500px");
		expect(onApplied).toHaveBeenCalledTimes(1);

		// Simulate fullscreen allocation increase
		setRect(output, 1000, 1200);

		// Trigger ResizeObserver delivery (test helper installed in setup.ts)
		(globalThis as any).__triggerResize(output);

		expect(root.style.height).toBe("800px"); // desired fits now
		expect(onApplied).toHaveBeenCalledTimes(2);

		ctrl.dispose();
	});

	it("works when hostEl is inside a ShadowRoot (closest must be applied on the shadow host)", () => {
		// marimo output container
		const output = document.createElement("div");
		output.dataset.cellRole = "output";
		document.body.appendChild(output);

		// <marimo-anywidget> host (light DOM)
		const anywidgetHost = document.createElement("marimo-anywidget");
		output.appendChild(anywidgetHost);

		// shadow root (where render(el=...) happens)
		const shadow = anywidgetHost.attachShadow({ mode: "open" });

		const hostEl = document.createElement("div");
		const rootEl = document.createElement("div");
		hostEl.appendChild(rootEl);
		shadow.appendChild(hostEl);

		// Initial allocated size
		setRect(output, 1000, 500);

		const onApplied = vi.fn();
		const ctrl = createHeightController({
			hostEl,
			rootEl,
			desiredPx: 800,
			onApplied,
		});

		ctrl.applyNow();
		expect(rootEl.style.height).toBe("500px");
		expect(onApplied).toHaveBeenCalledTimes(1);

		// Simulate fullscreen allocation increase
		setRect(output, 1000, 1200);
		(globalThis as any).__triggerResize(output);

		expect(rootEl.style.height).toBe("800px");
		expect(onApplied).toHaveBeenCalledTimes(2);

		ctrl.dispose();
	});
	it("clamps to the inner .output wrapper when present (marimo scroll container)", () => {
		const outputArea = document.createElement("div");
		outputArea.dataset.cellRole = "output";
		document.body.appendChild(outputArea);

		// This is the element that typically has overflow/max-height in marimo
		const outputWrapper = document.createElement("div");
		outputWrapper.className = "output block";
		outputArea.appendChild(outputWrapper);

		// anywidget host (light DOM)
		const anywidgetHost = document.createElement("marimo-anywidget");
		outputWrapper.appendChild(anywidgetHost);

		// shadow root (where render(el=...) happens)
		const shadow = anywidgetHost.attachShadow({ mode: "open" });

		const hostEl = document.createElement("div");
		const rootEl = document.createElement("div");
		hostEl.appendChild(rootEl);
		shadow.appendChild(hostEl);

		// output-area might be big…
		setRect(outputArea, 1000, 900);

		// …but the wrapper is what actually allocates visible height (small => scrollbar)
		setRect(outputWrapper, 1000, 400);

		const ctrl = createHeightController({
			hostEl,
			rootEl,
			desiredPx: 800,
			onApplied: vi.fn(),
		});

		ctrl.applyNow();
		expect(rootEl.style.height).toBe("400px");

		// fullscreen / expand: wrapper grows
		setRect(outputWrapper, 1000, 1200);
		(globalThis as any).__triggerResize(outputWrapper);

		expect(rootEl.style.height).toBe("800px");

		ctrl.dispose();
	});

	it("does nothing until allocation is measurable (>0)", () => {
		const output = document.createElement("div");
		output.dataset.cellRole = "output";
		document.body.appendChild(output);

		const host = document.createElement("div");
		output.appendChild(host);

		const root = document.createElement("div");
		host.appendChild(root);

		// Not measurable yet
		setRect(output, 1000, 0);

		const ctrl = createHeightController({
			hostEl: host,
			rootEl: root,
			desiredPx: 800,
			onApplied: vi.fn(),
		});

		ctrl.applyNow();
		expect(root.style.height).toBe("");

		ctrl.dispose();
	});

	it("rejects invalid desired heights", () => {
		const output = document.createElement("div");
		output.dataset.cellRole = "output";
		document.body.appendChild(output);

		const host = document.createElement("div");
		output.appendChild(host);

		const root = document.createElement("div");
		host.appendChild(root);

		setRect(output, 1000, 500);

		expect(() =>
			createHeightController({
				hostEl: host,
				rootEl: root,
				desiredPx: 0,
				onApplied: vi.fn(),
			}),
		).toThrow();
	});
});
