// frontend/src/ui.ts

export type UiConfig = {
	controlBar: {
		gapPx: number;
	};
	buttons: {
		padding: string;
		borderRadiusPx: number;
		border: string;
		font: string;
		activeBg: string;
		inactiveBg: string;
		activeText: string;
		inactiveText: string;
		removeActiveBg: string;
		removeActiveText: string;
	};
};

export const DEFAULT_UI_CONFIG: UiConfig = {
	controlBar: { gapPx: 12 },
	buttons: {
		padding: "6px 10px",
		borderRadiusPx: 8,
		border: "1px solid #ddd",
		font: "system-ui, sans-serif",
		activeBg: "#2563eb",
		inactiveBg: "#e5e7eb",
		activeText: "#ffffff",
		inactiveText: "#111827",
		removeActiveBg: "#dc2626",
		removeActiveText: "#ffffff",
	},
};

export type ControlBar = {
	el: HTMLElement;
	rotateBtn: HTMLButtonElement;
	lassoBtn: HTMLButtonElement;
	addBtn: HTMLButtonElement;
	removeBtn: HTMLButtonElement;
	labelSelect: HTMLSelectElement;
};

export function createControlBar(
	toolbar: HTMLElement,
	cfg: UiConfig,
): ControlBar {
	toolbar.style.gap = `${cfg.controlBar.gapPx}px`;

	const rotateBtn = document.createElement("button");
	rotateBtn.textContent = "Rotate";

	const lassoBtn = document.createElement("button");
	lassoBtn.textContent = "Lasso";

	const addBtn = document.createElement("button");
	addBtn.textContent = "Add";

	const removeBtn = document.createElement("button");
	removeBtn.textContent = "Remove";

	const labelSelect = document.createElement("select");

	for (const b of [rotateBtn, lassoBtn, addBtn, removeBtn]) {
		b.style.padding = cfg.buttons.padding;
		b.style.borderRadius = `${cfg.buttons.borderRadiusPx}px`;
		b.style.border = cfg.buttons.border;
		b.style.fontFamily = cfg.buttons.font;
		b.style.cursor = "pointer";
	}

	toolbar.appendChild(rotateBtn);
	toolbar.appendChild(lassoBtn);
	toolbar.appendChild(addBtn);
	toolbar.appendChild(removeBtn);
	toolbar.appendChild(labelSelect);

	return {
		el: toolbar,
		rotateBtn,
		lassoBtn,
		addBtn,
		removeBtn,
		labelSelect,
	};
}

export type UiState = {
	mode: "rotate" | "lasso";
	operation: "add" | "remove";
};

function styleBtn(
	btn: HTMLButtonElement,
	cfg: UiConfig,
	active: boolean,
	kind: "normal" | "remove" = "normal",
) {
	if (!active) {
		btn.style.background = cfg.buttons.inactiveBg;
		btn.style.color = cfg.buttons.inactiveText;
		return;
	}
	if (kind === "remove") {
		btn.style.background = cfg.buttons.removeActiveBg;
		btn.style.color = cfg.buttons.removeActiveText;
		return;
	}
	btn.style.background = cfg.buttons.activeBg;
	btn.style.color = cfg.buttons.activeText;
}

export function renderControlBar(bar: ControlBar, cfg: UiConfig, s: UiState) {
	const inLasso = s.mode === "lasso";

	// show/hide lasso-only controls
	bar.addBtn.style.display = inLasso ? "" : "none";
	bar.removeBtn.style.display = inLasso ? "" : "none";
	bar.labelSelect.style.display = inLasso ? "" : "none";

	// active/inactive styles
	styleBtn(bar.rotateBtn, cfg, s.mode === "rotate");
	styleBtn(bar.lassoBtn, cfg, s.mode === "lasso");
	styleBtn(bar.addBtn, cfg, inLasso && s.operation === "add");
	styleBtn(bar.removeBtn, cfg, inLasso && s.operation === "remove", "remove");
}
