import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHeightController } from "../src/height_controller";

describe("height_controller", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("uses desiredPx when no max-height constraint is found", () => {
		const outputArea = document.createElement("div");
		outputArea.dataset.cellRole = "output";
		document.body.appendChild(outputArea);

		const host = document.createElement("div");
		outputArea.appendChild(host);

		const root = document.createElement("div");
		host.appendChild(root);

		const onApplied = vi.fn();
		const ctrl = createHeightController({
			hostEl: host,
			rootEl: root,
			desiredPx: 800,
			onApplied,
		});

		ctrl.applyNow();
		expect(root.style.height).toBe("800px");
		expect(onApplied).toHaveBeenCalledWith(800);

		ctrl.dispose();
	});

	it("clamps to max-height budget minus vertical overhead (padding + borders)", () => {
		const outputArea = document.createElement("div");
		outputArea.dataset.cellRole = "output";
		document.body.appendChild(outputArea);

		// This is the constraint we expect to clamp to.
		outputArea.style.maxHeight = "500px";
		// Overhead = 10 + 6 + 2 + 2 = 20 => budget 480
		outputArea.style.paddingTop = "10px";
		outputArea.style.paddingBottom = "6px";
		outputArea.style.borderTopWidth = "2px";
		outputArea.style.borderBottomWidth = "2px";

		const host = document.createElement("div");
		outputArea.appendChild(host);

		const root = document.createElement("div");
		host.appendChild(root);

		const onApplied = vi.fn();
		const ctrl = createHeightController({
			hostEl: host,
			rootEl: root,
			desiredPx: 800,
			onApplied,
		});

		ctrl.applyNow();
		expect(root.style.height).toBe("480px");
		expect(onApplied).toHaveBeenCalledWith(480);

		ctrl.dispose();
	});

	it("updates on ResizeObserver delivery for the chosen constraint element", () => {
		const outputArea = document.createElement("div");
		outputArea.dataset.cellRole = "output";
		document.body.appendChild(outputArea);

		outputArea.style.maxHeight = "500px";

		const host = document.createElement("div");
		outputArea.appendChild(host);

		const root = document.createElement("div");
		host.appendChild(root);

		const onApplied = vi.fn();
		const ctrl = createHeightController({
			hostEl: host,
			rootEl: root,
			desiredPx: 800,
			onApplied,
		});

		ctrl.applyNow();
		expect(root.style.height).toBe("500px");

		// Increase max-height and trigger the ResizeObserver hook installed in setup.ts.
		outputArea.style.maxHeight = "1200px";
		(globalThis as any).__triggerResize(outputArea);

		expect(root.style.height).toBe("800px");
		expect(onApplied).toHaveBeenCalledTimes(2);

		ctrl.dispose();
	});

	it("prefers the element that actually carries a max-height constraint (inner .output wrapper vs output area)", () => {
		const outputArea = document.createElement("div");
		outputArea.dataset.cellRole = "output";
		document.body.appendChild(outputArea);

		// Big output area, but not constrained
		outputArea.style.maxHeight = "1200px";

		const outputWrapper = document.createElement("div");
		outputWrapper.className = "output block";
		outputArea.appendChild(outputWrapper);

		// Wrapper is the real scroll/constraint container
		outputWrapper.style.maxHeight = "400px";

		const anywidgetHost = document.createElement("marimo-anywidget");
		outputWrapper.appendChild(anywidgetHost);

		const shadow = anywidgetHost.attachShadow({ mode: "open" });
		const hostEl = document.createElement("div");
		const rootEl = document.createElement("div");
		hostEl.appendChild(rootEl);
		shadow.appendChild(hostEl);

		const ctrl = createHeightController({
			hostEl,
			rootEl,
			desiredPx: 800,
			onApplied: vi.fn(),
		});

		ctrl.applyNow();
		expect(rootEl.style.height).toBe("400px");

		outputWrapper.style.maxHeight = "900px";
		(globalThis as any).__triggerResize(outputWrapper);

		expect(rootEl.style.height).toBe("800px");

		ctrl.dispose();
	});

	it("works when hostEl is inside a ShadowRoot (closest must be applied on the shadow host)", () => {
		const outputArea = document.createElement("div");
		outputArea.dataset.cellRole = "output";
		document.body.appendChild(outputArea);

		// Put the constraint on the output area (common case).
		outputArea.style.maxHeight = "500px";

		const anywidgetHost = document.createElement("marimo-anywidget");
		outputArea.appendChild(anywidgetHost);

		const shadow = anywidgetHost.attachShadow({ mode: "open" });

		const hostEl = document.createElement("div");
		const rootEl = document.createElement("div");
		hostEl.appendChild(rootEl);
		shadow.appendChild(hostEl);

		const onApplied = vi.fn();
		const ctrl = createHeightController({
			hostEl,
			rootEl,
			desiredPx: 800,
			onApplied,
		});

		ctrl.applyNow();
		expect(rootEl.style.height).toBe("500px");
		expect(onApplied).toHaveBeenCalledWith(500);

		outputArea.style.maxHeight = "1200px";
		(globalThis as any).__triggerResize(outputArea);

		expect(rootEl.style.height).toBe("800px");
		expect(onApplied).toHaveBeenCalledTimes(2);

		ctrl.dispose();
	});

	it("rejects invalid desired heights (eager validation)", () => {
		const outputArea = document.createElement("div");
		outputArea.dataset.cellRole = "output";
		document.body.appendChild(outputArea);

		outputArea.style.maxHeight = "500px";

		const host = document.createElement("div");
		outputArea.appendChild(host);

		const root = document.createElement("div");
		host.appendChild(root);

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
