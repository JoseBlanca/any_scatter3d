// tooltip_controller.ts
import type { WidgetModel } from "./model";
import { TRAITS } from "./model";
import type { createThreeScene } from "./three_scene";

export type TooltipView = {
	hide: () => void;
	showAt: (cssX: number, cssY: number, rows: Array<[string, string]>) => void;
	showLoadingAt: (cssX: number, cssY: number) => void;
	showErrorAt: (cssX: number, cssY: number, message: string) => void;
};

type TooltipResponse =
	| { status: "ok"; request_id: number; data: Record<string, unknown> }
	| { status: "error"; request_id: number; message?: unknown };

export type TooltipControllerDeps = {
	model: WidgetModel;
	three: ReturnType<typeof createThreeScene>;
	threeCanvas: HTMLCanvasElement;
	view: TooltipView;

	// used to ignore tooltip clicks while lassoing
	isLassoMode: () => boolean;

	// attach DOM listener with AbortController
	signal: AbortSignal;
};

function isTooltipResponse(x: unknown): x is TooltipResponse {
	if (!x || typeof x !== "object") return false;
	const r = x as any;
	if (typeof r.request_id !== "number") return false;
	if (r.status !== "ok" && r.status !== "error") return false;
	if (r.status === "ok" && (!r.data || typeof r.data !== "object"))
		return false;
	// message is optional for error
	return true;
}

export function createTooltipController(deps: TooltipControllerDeps): {
	onTooltipResponseChange: () => void;
	dispose: () => void;
} {
	const { model, three, threeCanvas, view, isLassoMode, signal } = deps;

	let tooltipReqCounter = 0;
	let pendingTooltipReq: number | null = null;
	let pendingTooltipPos: { x: number; y: number } | null = null;

	const onClick = (e: MouseEvent) => {
		if (isLassoMode()) return;

		const rect = threeCanvas.getBoundingClientRect();
		const cssX = e.clientX - rect.left;
		const cssY = e.clientY - rect.top;

		const x01 = rect.width > 0 ? cssX / rect.width : 0;
		const y01 = rect.height > 0 ? cssY / rect.height : 0;

		const ndcX = x01 * 2 - 1;
		const ndcY = -(y01 * 2 - 1);

		const idx = three.pickPointIndex(ndcX, ndcY);
		if (idx == null) {
			view.hide();
			return;
		}

		const req = ++tooltipReqCounter;
		pendingTooltipReq = req;
		pendingTooltipPos = { x: cssX, y: cssY };

		view.showLoadingAt(cssX, cssY);

		model.set(TRAITS.tooltipRequest, {
			kind: "tooltip",
			i: idx,
			request_id: req,
		});
		model.save_changes();
	};

	threeCanvas.addEventListener("click", onClick, { signal });

	const onTooltipResponseChange = () => {
		const raw = model.get(TRAITS.tooltipResponse) as unknown;
		if (!isTooltipResponse(raw)) return;

		// Ignore out-of-order responses
		if (pendingTooltipReq != null && raw.request_id !== pendingTooltipReq)
			return;
		if (!pendingTooltipPos) return;

		// Consume the pending request. Also clear the counter so next click is clean.
		pendingTooltipReq = null;

		if (raw.status === "error") {
			view.showErrorAt(
				pendingTooltipPos.x,
				pendingTooltipPos.y,
				String(raw.message ?? "unknown"),
			);
			return;
		}

		// ok
		const rows: Array<[string, string]> = [];
		for (const [k, v] of Object.entries(raw.data)) {
			rows.push([String(k), String(v)]);
		}

		view.showAt(pendingTooltipPos.x, pendingTooltipPos.y, rows);
	};

	return {
		onTooltipResponseChange,
		dispose: () => {
			// click listener is removed automatically by AbortController signal
			pendingTooltipReq = null;
			pendingTooltipPos = null;
		},
	};
}
