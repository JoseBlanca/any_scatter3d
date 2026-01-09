export type WidgetModel = {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
	save_changes(): void;
	on(event: string, cb: () => void): void;
	off(event: string, callback: () => void): void;
};

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
