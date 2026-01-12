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

	// Overlay placement (host is positioned absolutely inside canvasHost)
	setPlacement: (p: { side: "left" | "right"; dock: "top" | "bottom" }) => void;

	dispose: () => void;
};

export function createLegendView(host: HTMLElement, ui: UiConfig): LegendView {
	const el = document.createElement("div");
	el.dataset.testid = "legend";
	host.appendChild(el);

	// Host is the positioned overlay layer (we style host, not el).
	host.style.position = "absolute";
	// ui.legendOverlay must exist in UiConfig; if it doesn't yet, TS will complain until you add it.
	host.style.zIndex = String(ui.legendOverlay.zIndex);
	host.style.pointerEvents = "auto";

	// The scroll container is the legend element itself.
	el.style.pointerEvents = "auto";
	el.style.boxSizing = "border-box";
	el.style.background = ui.legendOverlay.bg;
	el.style.border = ui.legendOverlay.border;
	el.style.borderRadius = `${ui.legendOverlay.borderRadiusPx}px`;
	el.style.padding = `${ui.legendOverlay.paddingPx}px`;
	el.style.boxShadow = ui.legendOverlay.boxShadow;
	el.style.maxWidth = `${ui.legendOverlay.maxWidthPx}px`;
	el.style.maxHeight = `${ui.legendOverlay.maxHeightPx}px`;
	el.style.overflow = "auto";

	let clickCb: ((label: string) => void) | null = null;

	function onItemClick(cb: (label: string) => void) {
		clickCb = cb;
	}

	function setPlacement(p: { side: "left" | "right"; dock: "top" | "bottom" }) {
		const m = ui.legendOverlay.marginPx;

		// reset
		host.style.left = "";
		host.style.right = "";
		host.style.top = "";
		host.style.bottom = "";

		if (p.side === "left") host.style.left = `${m}px`;
		else host.style.right = `${m}px`;

		if (p.dock === "top") host.style.top = `${m}px`;
		else host.style.bottom = `${m}px`;
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

		// Text styling (ok to keep here)
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
		setPlacement,
		dispose: () => {
			el.removeEventListener("click", handleClick);
			el.removeEventListener("mouseover", handleMouseOver);
			el.removeEventListener("mouseout", handleMouseOut);
			el.remove();
		},
	};
}
