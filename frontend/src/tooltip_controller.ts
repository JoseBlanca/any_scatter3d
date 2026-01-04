import type { WidgetModel } from "./model";
import { TRAITS } from "./model";
import type { createThreeScene } from "./three_scene";

export type TooltipView = {
	hide: () => void;
	showAt: (cssX: number, cssY: number, html: string) => void;
};

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

		view.showAt(cssX, cssY, "Loading…");

		model.set(TRAITS.tooltipRequest, {
			kind: "tooltip",
			i: idx,
			request_id: req,
		});
		model.save_changes();
	};

	threeCanvas.addEventListener("click", onClick, { signal });

	const onTooltipResponseChange = () => {
		const res = model.get(TRAITS.tooltipResponse) as any;
		if (!res || typeof res !== "object") return;

		const requestId = (res as any).request_id;
		if (pendingTooltipReq != null && requestId !== pendingTooltipReq) return;

		if (!pendingTooltipPos) return;

		if (res.status === "error") {
			view.showAt(
				pendingTooltipPos.x,
				pendingTooltipPos.y,
				`Error: ${String(res.message ?? "unknown")}`,
			);
			return;
		}

		const data = (res as any).data ?? {};
		const rows: string[] = [];
		for (const [k, v] of Object.entries(data)) {
			rows.push(`<div><b>${k}</b>: ${String(v)}</div>`);
		}
		view.showAt(pendingTooltipPos.x, pendingTooltipPos.y, rows.join(""));
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
