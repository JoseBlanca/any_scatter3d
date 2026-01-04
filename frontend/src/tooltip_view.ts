export type TooltipView = {
	hide: () => void;
	showAt: (cssX: number, cssY: number, rows: Array<[string, string]>) => void;
	showLoadingAt: (cssX: number, cssY: number) => void;
	showErrorAt: (cssX: number, cssY: number, message: string) => void;
};

export function createTooltipView(tooltipEl: HTMLElement): TooltipView {
	function hide() {
		tooltipEl.style.display = "none";
	}

	function position(cssX: number, cssY: number) {
		tooltipEl.style.left = `${cssX + 10}px`;
		tooltipEl.style.top = `${cssY + 10}px`;
		tooltipEl.style.display = "block";
	}

	function clear() {
		tooltipEl.replaceChildren();
	}

	function showLoadingAt(cssX: number, cssY: number) {
		clear();
		tooltipEl.textContent = "Loading…";
		position(cssX, cssY);
	}

	function showErrorAt(cssX: number, cssY: number, message: string) {
		clear();
		tooltipEl.textContent = `Error: ${message}`;
		position(cssX, cssY);
	}

	function showAt(cssX: number, cssY: number, rows: Array<[string, string]>) {
		clear();

		for (const [k, v] of rows) {
			const row = document.createElement("div");

			const b = document.createElement("b");
			b.textContent = k;

			row.appendChild(b);
			row.append(`: ${v}`);

			tooltipEl.appendChild(row);
		}

		position(cssX, cssY);
	}

	return { hide, showAt, showLoadingAt, showErrorAt };
}
