import { describe, it, expect } from "vitest";
import { TRAITS, changeEvent, type WidgetModel } from "../src/model";
import { createControlBar, renderControlBar, type UiState } from "../src/ui";
import { createInteractionController } from "../src/interaction_controller";

// Minimal ThreeScene stub: we never reach selectMaskInLasso in this test.
const threeStub: any = {};

function makeToolbar(): HTMLElement {
	const el = document.createElement("div");
	document.body.appendChild(el);
	return el;
}

function makeRootAndCanvas() {
	const root = document.createElement("div");
	const canvas = document.createElement("canvas");
	root.appendChild(canvas);
	document.body.appendChild(root);
	return { root, canvas };
}

/**
 * Minimal model with Backbone-ish on/off + typed get/set.
 * Matches the parts InteractionController uses.
 */
function makeModel(initial: Record<string, any>): WidgetModel & {
	emit: (trait: string) => void;
} {
	const values = new Map<string, any>(Object.entries(initial));
	const listeners = new Map<string, Set<() => void>>();

	return {
		get(key: any) {
			return values.get(key);
		},
		set(key: any, v: any) {
			values.set(key, v);
		},
		save_changes() {
			return undefined;
		},
		on(event: string, cb: () => void) {
			if (!listeners.has(event)) listeners.set(event, new Set());
			listeners.get(event)!.add(cb);
		},
		off(event: string, cb: () => void) {
			listeners.get(event)?.delete(cb);
		},
		emit(trait: string) {
			const ev = `change:${trait}`;
			for (const cb of listeners.get(ev) ?? []) cb();
		},
	};
}

describe("control bar visibility follows category_editable_t", () => {
	it("hides bar and forces rotate when category_editable_t becomes false; restores when true", () => {
		const toolbar = makeToolbar();

		// UiConfig can be minimal; createControlBar only reads these fields.
		const cfg: any = {
			controlBar: { gapPx: 12 },
			messages: { marginLeftPx: 8, fontSizePx: 12, color: "#000" },
			buttons: {
				padding: "6px 10px",
				borderRadiusPx: 6,
				border: "1px solid #ddd",
				font: "system-ui",
				inactiveBg: "#eee",
				inactiveText: "#111",
				activeBg: "#111",
				activeText: "#fff",
				removeActiveBg: "#a00",
				removeActiveText: "#fff",
			},
		};

		const bar = createControlBar(toolbar, cfg);

		// state + syncUi stub (matches your wiring pattern)
		const uiState: UiState = { mode: "rotate", operation: "add" };
		const syncUiFromState = () => renderControlBar(bar, cfg, uiState);

		const { root, canvas } = makeRootAndCanvas();

		const ac = new AbortController();

		const model = makeModel({
			[TRAITS.activeCategory]: "A",
			[TRAITS.interactionMode]: "rotate",
			// start editable
			["category_editable_t"]: true,
		});

		// Minimal InteractionState shape required by controller guards.
		const state: any = {
			mode: { kind: "rotate" },
			pixelWidth: 100,
			pixelHeight: 100,
			dpr: 1,
			lastPointer: null,
		};

		createInteractionController({
			model,
			three: threeStub,
			bar,
			state,
			root,
			canvas,
			syncUiFromState,
			signal: ac.signal,
			transportReady: () => true,
			showMessage: () => {},
			clearMessage: () => {},
		});

		// Initially visible (editable=true)
		expect(bar.el.style.display).not.toBe("none");

		// Flip to not editable
		model.set("category_editable_t" as any, false);
		model.emit("category_editable_t");

		expect(bar.el.style.display).toBe("none");
		// forced rotate
		expect(model.get(TRAITS.interactionMode)).toBe("rotate");
		expect(state.mode.kind).toBe("rotate");

		// Flip back to editable
		model.set("category_editable_t" as any, true);
		model.emit("category_editable_t");

		expect(bar.el.style.display).not.toBe("none");
	});
});
