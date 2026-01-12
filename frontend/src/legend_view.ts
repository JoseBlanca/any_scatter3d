// legend_view.ts
import type { RGB } from "./model";
import type { UiConfig } from "./ui_config";

export type LegendItem = {
	label: string;
	color: RGB;
	isActive: boolean;
};

export type LegendMode = "rotate" | "lasso";

export type LegendViewState = {
	mode: LegendMode;
	items: LegendItem[];
};

export type LegendView = {
	el: HTMLElement;
	render: (s: LegendViewState) => void;
	onItemClick: (cb: (label: string) => void) => void;
	dispose: () => void;
};

export function createLegendView(host: HTMLElement, ui: UiConfig): LegendView {
	const el = document.createElement("div");
	el.dataset.testid = "legend";
	host.appendChild(el);

	let clickCb: ((label: string) => void) | null = null;

	function onItemClick(cb: (label: string) => void) {
		clickCb = cb;
	}

	function isRowActive(row: HTMLElement): boolean {
		return row.dataset.active === "1";
	}

	function applyRowBg(row: HTMLElement) {
		row.style.background = isRowActive(row)
			? ui.legend.activeRowBg
			: "transparent";
	}

	// Event delegation: keeps DOM wiring simple and avoids per-row listeners.
	function handleClick(e: MouseEvent) {
		const t = e.target as HTMLElement | null;
		const row = t?.closest?.("[data-legend-label]") as HTMLElement | null;
		if (!row) return;
		const label = row.dataset.legendLabel;
		if (!label) return;
		clickCb?.(label);
	}

	// Hover must never trigger redraw; keep it view-local only.
	function handleMouseOver(e: MouseEvent) {
		const t = e.target as HTMLElement | null;
		const row = t?.closest?.("[data-legend-label]") as HTMLElement | null;
		if (!row) return;

		row.dataset.hover = "1";

		// If not active, show hover bg; if active, keep active bg.
		if (!isRowActive(row)) {
			row.style.background = ui.legend.hoverRowBg;
		}
	}

	function handleMouseOut(e: MouseEvent) {
		const t = e.target as HTMLElement | null;
		const row = t?.closest?.("[data-legend-label]") as HTMLElement | null;
		if (!row) return;

		delete row.dataset.hover;

		// Restore correct bg based on active state.
		applyRowBg(row);
	}

	el.addEventListener("click", handleClick);
	el.addEventListener("mouseover", handleMouseOver);
	el.addEventListener("mouseout", handleMouseOut);

	function render(s: LegendViewState) {
		el.innerHTML = "";

		// Container-level styling (optional but keeps things consistent)
		el.style.font = ui.legend.font;
		el.style.color = ui.legend.textColor;

		for (const item of s.items) {
			const row = document.createElement("div");
			row.dataset.legendLabel = item.label;
			row.dataset.testid = `legend-item:${item.label}`;
			row.dataset.active = item.isActive ? "1" : "0";
			row.dataset.mode = s.mode;

			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = `${ui.legend.rowGapPx}px`;
			row.style.padding = ui.legend.rowPadding;
			row.style.borderRadius = `${ui.legend.rowBorderRadiusPx}px`;
			row.style.cursor = "pointer";
			applyRowBg(row);

			const swatch = document.createElement("span");
			swatch.dataset.testid = `legend-swatch:${item.label}`;
			swatch.style.display = "inline-block";
			swatch.style.width = "12px";
			swatch.style.height = "12px";
			swatch.style.flex = "0 0 12px";
			swatch.style.borderRadius = "2px";
			swatch.style.background = `rgb(${Math.round(item.color[0] * 255)}, ${Math.round(
				item.color[1] * 255,
			)}, ${Math.round(item.color[2] * 255)})`;

			const text = document.createElement("span");
			text.textContent = item.label;

			row.appendChild(swatch);
			row.appendChild(text);

			el.appendChild(row);
		}
	}

	return {
		el,
		render,
		onItemClick,
		dispose: () => {
			el.removeEventListener("click", handleClick);
			el.removeEventListener("mouseover", handleMouseOver);
			el.removeEventListener("mouseout", handleMouseOut);
			el.remove();
		},
	};
}
