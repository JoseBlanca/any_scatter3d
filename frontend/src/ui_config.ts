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
	legend: {
		rowPadding: string;
		rowBorderRadiusPx: number;
		rowGapPx: number;
		activeRowBg: string;
		hoverRowBg: string;
		textColor: string;
		font: string;
	};
	messages: {
		marginLeftPx: number;
		fontSizePx: number;
		color: string;
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
	legend: {
		rowPadding: "4px 6px",
		rowBorderRadiusPx: 6,
		rowGapPx: 6,
		activeRowBg: "rgba(0, 0, 0, 0.06)",
		hoverRowBg: "rgba(0, 0, 0, 0.04)",
		textColor: "#111827",
		font: "system-ui, sans-serif",
	},
	messages: {
		marginLeftPx: 8,
		fontSizePx: 12,
		color: "#b91c1c",
	},
};
