import type { RGB } from "./model";

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

export function createLegendView(host: HTMLElement): LegendView {
	const el = document.createElement("div");
	el.dataset.testid = "legend";
	host.appendChild(el);

	let clickCb: ((label: string) => void) | null = null;

	function onItemClick(cb: (label: string) => void) {
		clickCb = cb;
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
	}
	function handleMouseOut(e: MouseEvent) {
		const t = e.target as HTMLElement | null;
		const row = t?.closest?.("[data-legend-label]") as HTMLElement | null;
		if (!row) return;
		delete row.dataset.hover;
	}

	el.addEventListener("click", handleClick);
	el.addEventListener("mouseover", handleMouseOver);
	el.addEventListener("mouseout", handleMouseOut);

	function render(s: LegendViewState) {
		// Minimal rendering (no layout decisions yet).
		// Styling is intentionally basic; we’ll discuss final UX before wiring it into the widget.
		el.innerHTML = "";

		for (const item of s.items) {
			const row = document.createElement("div");
			row.dataset.legendLabel = item.label;
			row.dataset.testid = `legend-item:${item.label}`;
			row.dataset.active = item.isActive ? "1" : "0";
			row.dataset.mode = s.mode;

			const swatch = document.createElement("span");
			swatch.dataset.testid = `legend-swatch:${item.label}`;
			// tiny inline swatch; real styling later
			swatch.style.display = "inline-block";
			swatch.style.width = "12px";
			swatch.style.height = "12px";
			swatch.style.marginRight = "6px";
			swatch.style.verticalAlign = "middle";
			swatch.style.background = `rgb(${Math.round(
				item.color[0] * 255,
			)}, ${Math.round(item.color[1] * 255)}, ${Math.round(
				item.color[2] * 255,
			)})`;

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
