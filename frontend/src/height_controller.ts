// DOM-side controller that clamps widget root height to the allocated height
// of the notebook output container.
//
// This stays notebook-agnostic except for the selector used to find the
// output container. It does not touch three.js, lasso, etc.

import { computeEffectiveHeightPx } from "./layout_height";

export type HeightControllerDeps = {
	// anywidget host element (in light DOM)
	hostEl: HTMLElement;

	// widget root element (inside the widget)
	rootEl: HTMLElement;

	// desired height in CSS px; must be finite and > 0
	desiredPx: number;

	// optional hook for integration tests / wiring
	onApplied?: (heightPx: number) => void;
};

export type HeightController = {
	applyNow: () => void;
	dispose: () => void;
};

function parseCssPx(v: string): number | null {
	// Accept only px (professional: no guessing with %, vh, calc(), etc.)
	// If marimo ever uses calc(), we should explicitly support it with a real parser,
	// not silent fallbacks.
	const s = v.trim();
	if (s === "" || s === "none" || s === "auto") return null;
	if (!s.endsWith("px")) return null;

	const num = Number(s.slice(0, -2));
	return Number.isFinite(num) && num > 0 ? num : null;
}

function getMaxHeightPx(el: HTMLElement): number | null {
	const cs = window.getComputedStyle(el);
	return parseCssPx(cs.maxHeight);
}

function parseCssNumberOrZero(v: string): number {
	// Real browsers usually return "0px".
	// jsdom may return "" for unset computed styles.
	const s = v.trim();
	if (s === "") return 0;

	const n = Number.parseFloat(s);
	// We only accept finite, non-negative values.
	return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function getVerticalOverheadPx(el: HTMLElement): number {
	const cs = window.getComputedStyle(el);

	const pt = parseCssNumberOrZero(cs.paddingTop);
	const pb = parseCssNumberOrZero(cs.paddingBottom);
	const bt = parseCssNumberOrZero(cs.borderTopWidth);
	const bb = parseCssNumberOrZero(cs.borderBottomWidth);

	const vals: Record<string, number> = { pt, pb, bt, bb };
	for (const [k, n] of Object.entries(vals)) {
		if (!Number.isFinite(n) || n < 0) {
			throw new Error(
				`height_controller: cannot parse vertical overhead from computed styles: ` +
					`paddingTop=${cs.paddingTop} paddingBottom=${cs.paddingBottom} ` +
					`borderTopWidth=${cs.borderTopWidth} borderBottomWidth=${cs.borderBottomWidth} ` +
					`(bad ${k})`,
			);
		}
	}

	return pt + pb + bt + bb;
}

function getSearchStartEl(hostEl: HTMLElement): HTMLElement {
	const rootNode = hostEl.getRootNode?.();
	const maybeHost = rootNode && (rootNode as any).host;
	return maybeHost instanceof HTMLElement ? maybeHost : hostEl;
}

function findConstraintElement(hostEl: HTMLElement): HTMLElement | null {
	const searchStart = getSearchStartEl(hostEl);

	const outputArea = searchStart.closest<HTMLElement>(
		'[data-cell-role="output"]',
	);
	if (!outputArea) return null;

	// Prefer the element that actually carries a max-height constraint.
	// In your earlier DOM dump, the constraint was on the output area itself (e.g. max-height: 610px).
	// The inner ".output" wrapper is often content-sized and NOT a reliable "budget".
	const inner =
		outputArea.querySelector<HTMLElement>(":scope > .output") ??
		outputArea.querySelector<HTMLElement>(".output");

	const candidates = [outputArea, inner].filter(Boolean) as HTMLElement[];

	for (const el of candidates) {
		const mh = getMaxHeightPx(el);
		if (mh != null) return el;
	}

	// If no max-height constraint is found, fall back to outputArea as the place where
	// fullscreen classes/styles are applied.
	return outputArea;
}

export function createHeightController(
	deps: HeightControllerDeps,
): HeightController {
	const { hostEl, rootEl, desiredPx, onApplied } = deps;

	// Validate eagerly so callers/tests get deterministic failures at construction time.
	if (!(typeof desiredPx === "number" && Number.isFinite(desiredPx))) {
		throw new Error(
			`height_controller: desiredPx must be finite number, got ${desiredPx}`,
		);
	}
	if (desiredPx <= 0) {
		throw new Error(
			`height_controller: desiredPx must be > 0, got ${desiredPx}`,
		);
	}

	const constraintElMaybe = findConstraintElement(hostEl);
	if (!constraintElMaybe) {
		throw new Error(
			`height_controller: could not find constraint element (expected closest('[data-cell-role="output"]') from widget host)`,
		);
	}
	const constraintEl: HTMLElement = constraintElMaybe;
	let disposed = false;

	const ro = new ResizeObserver(() => {
		if (disposed) return;
		applyNow();
	});
	ro.observe(constraintEl);

	const mo = new MutationObserver(() => {
		if (disposed) return;
		applyNow();
	});

	// Fullscreen/expand often changes class/style, not size.
	// Observe attributes that affect constraints.
	mo.observe(constraintEl, {
		attributes: true,
		attributeFilter: ["class", "style"],
	});

	function applyNow() {
		const maxAllowedPx = getMaxHeightPx(constraintEl);

		// Only compute overhead when we are actually clamping to max-height.
		// This avoids unnecessary computed-style parsing (and avoids jsdom "" issues when max-height is none).
		const overheadPx =
			maxAllowedPx === null ? 0 : getVerticalOverheadPx(constraintEl);

		const next = computeEffectiveHeightPx({
			desiredPx,
			maxAllowedPx,
			overheadPx,
		});

		rootEl.style.height = `${next}px`;
		rootEl.style.minHeight = "";
		onApplied?.(next);

		if ((globalThis as any).__scatter3d_height_debug) {
			const cs = window.getComputedStyle(constraintEl);
			console.debug("[scatter3d][height][applyNow]", {
				constraintEl,
				tag: constraintEl.tagName,
				className: constraintEl.className,
				desiredPx,
				maxHeight: cs.maxHeight,
				maxAllowedPx,
				overheadPx,
				nextPx: next,
			});
		}
	}

	return {
		applyNow,
		dispose: () => {
			disposed = true;
			ro.disconnect();
			mo.disconnect();
		},
	};
}
