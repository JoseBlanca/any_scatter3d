// model.ts

// 1) Protocol / model interface =================================================

export const TRAITS = {
	xyzBytes: "xyz_bytes_t",
	codedValues: "coded_values_t",
	labels: "labels_t",
	colors: "colors_t",
	missingColor: "missing_color_t",

	lassoRequest: "lasso_request_t",
	lassoMask: "lasso_mask_t",
	lassoResult: "lasso_result_t",

	pointSize: "point_size_t",
	axisLabelSize: "axis_label_size_t",
	showAxes: "show_axes_t",

	tooltipRequest: "tooltip_request_t",
	tooltipResponse: "tooltip_response_t",

	interactiveReady: "interactive_ready_t",
	clientReady: "client_ready_t",
} as const;

export type TraitKey = typeof TRAITS[keyof typeof TRAITS];

// 2) Domain types ===============================================================

export type RGB = [number, number, number];

export type LassoOp = "add" | "remove";

export type LassoRequest = {
	kind: "lasso_commit";
	op: LassoOp;
	label?: string;
	request_id?: number;
};

export type LassoResult =
	| {
			request_id?: number;
			status: "ok";
			num_selected?: number;
			num_changed?: number;
	  }
	| {
			request_id?: number;
			status: "error";
			message: string;
	  };

export type TooltipRequest = { kind: "tooltip"; i: number; request_id: number };

export type TooltipResponse =
	| { request_id?: number; status: "ok"; data: Record<string, unknown> }
	| { request_id?: number; status: "error"; message: string };

// 3) Trait value typing (the important bit) =====================================
//
// Key idea: map the *actual trait string* (e.g. "xyz_bytes_t") to its TS type.
// This lets WidgetModel.get/set be strongly typed.
//
// Notes:
// - For "bytes" traits coming from Jupyter, you may see ArrayBuffer, DataView,
//   Uint8Array, etc depending on the widget stack. Keep it permissive here.
// - For request/response traits, using `null` as "unset" is usually best.

export type BytesLike = ArrayBuffer | Uint8Array | DataView | null | undefined;

export type TraitValueMap = {
	[TRAITS.xyzBytes]: BytesLike;
	[TRAITS.codedValues]: BytesLike;

	[TRAITS.labels]: string[] | null | undefined;
	[TRAITS.colors]: RGB[] | null | undefined;
	[TRAITS.missingColor]: RGB | null | undefined;

	[TRAITS.lassoRequest]: LassoRequest | null | undefined;
	[TRAITS.lassoMask]: string; // <-- base64 string
	[TRAITS.lassoResult]: LassoResult | null | undefined;

	[TRAITS.pointSize]: number | null | undefined;
	[TRAITS.axisLabelSize]: number | null | undefined;
	[TRAITS.showAxes]: boolean | null | undefined;

	[TRAITS.tooltipRequest]: TooltipRequest | null | undefined;
	[TRAITS.tooltipResponse]: TooltipResponse | null | undefined;

	// Handshake flags
	[TRAITS.interactiveReady]: boolean | null | undefined;
	[TRAITS.clientReady]: boolean | null | undefined;
};

// 4) Typed model interface ======================================================
//
// This keeps Backbone-ish 'on/off' because the widget model uses string events,
// but strongly types get/set by trait key.

export type WidgetModel = {
	get<K extends keyof TraitValueMap>(key: K): TraitValueMap[K];
	set<K extends keyof TraitValueMap>(key: K, value: TraitValueMap[K]): void;
	save_changes(): void;

	on(event: string, cb: () => void): void;
	off(event: string, callback: () => void): void;
};

// 5) Small helpers to reduce unsafe code =======================================

export function changeEvent<K extends TraitKey>(trait: K): `change:${K}` {
	return `change:${trait}`;
}

export function getBoolean(
	model: WidgetModel,
	key: keyof TraitValueMap,
): boolean {
	const v = model.get(key as any);
	// Accept only literal true; everything else -> false
	return v === true;
}

export function getNumber(
	model: WidgetModel,
	key: keyof TraitValueMap,
	fallback: number,
): number {
	const v = model.get(key as any);
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
