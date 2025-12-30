import type { PointerInfo } from "./view";

const MIN_LASSO_DIST_BETWEEN_POINTS = 2;

export type LassoOp = "add" | "remove";

export type InteractionMode =
	| { kind: "rotate" }
	| { kind: "lasso"; operation: LassoOp };

export type LassoPoint = {
	// normalized device coordinates (-1..1), used for selection against projected points
	normDevCoordX: number;
	normDevCoordY: number;

	// css pixels, used only for drawing the overlay
	cssX: number;
	cssY: number;
};

export type LassoState =
	| { kind: "idle" }
	| { kind: "drawing"; points: LassoPoint[] }
	| { kind: "ready"; points: LassoPoint[] };

export type InteractionState = {
	mode: InteractionMode;
	lasso: LassoState;
	lastPointer: PointerInfo | null;

	dpr: number;
	pixelWidth: number;
	pixelHeight: number;
};

export type PolygonNdc = { x: number; y: number }[];

export function createInteractionState(): InteractionState {
	return {
		mode: { kind: "rotate" },
		lasso: { kind: "idle" },
		lastPointer: null,
		dpr: 1,
		pixelWidth: 1,
		pixelHeight: 1,
	};
}

export function setMode(state: InteractionState, next: InteractionMode) {
	state.mode = next;
	if (state.mode.kind === "rotate") state.lasso = { kind: "idle" };
}

export function onPointerMove(state: InteractionState, p: PointerInfo) {
	state.lastPointer = p;

	if (state.mode.kind !== "lasso") return;
	if (state.lasso.kind !== "drawing") return;

	const pts = state.lasso.points;
	const last = pts[pts.length - 1];

	const dx = p.cssX - last.cssX;
	const dy = p.cssY - last.cssY;
	const minDistPx = MIN_LASSO_DIST_BETWEEN_POINTS;
	if (dx * dx + dy * dy < minDistPx * minDistPx) return;

	pts.push({
		cssX: p.cssX,
		cssY: p.cssY,
		normDevCoordX: p.normDevCoordX,
		normDevCoordY: p.normDevCoordY,
	});
}

export function onPointerDown(state: InteractionState, p: PointerInfo) {
	if (state.mode.kind !== "lasso") return;
	if (!p.isInside) return;

	state.lasso = {
		kind: "drawing",
		points: [
			{
				cssX: p.cssX,
				cssY: p.cssY,
				normDevCoordX: p.normDevCoordX,
				normDevCoordY: p.normDevCoordY,
			},
		],
	};
}

export function onPointerUp(state: InteractionState) {
	if (state.mode.kind !== "lasso") return;
	if (state.lasso.kind !== "drawing") return;
	state.lasso = { kind: "ready", points: state.lasso.points };
}

export function cancelLasso(state: InteractionState) {
	state.lasso = { kind: "idle" };
}

export function commitLasso(state: InteractionState): PolygonNdc | null {
	if (state.mode.kind !== "lasso") return null;
	if (state.lasso.kind !== "ready") return null;

	const pts = state.lasso.points;
	if (pts.length < 3) {
		state.lasso = { kind: "idle" };
		return null;
	}

	const polygon: PolygonNdc = pts.map((p) => ({
		x: p.normDevCoordX,
		y: p.normDevCoordY,
	}));

	state.lasso = { kind: "idle" };
	return polygon;
}

export function drawOverlay(
	state: InteractionState,
	ctx: CanvasRenderingContext2D | null,
) {
	if (!ctx) return;

	// Clear overlay
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, state.pixelWidth, state.pixelHeight);

	// Only draw lasso in lasso mode
	if (state.mode.kind !== "lasso") return;

	if (state.lasso.kind === "drawing" || state.lasso.kind === "ready") {
		const pts = state.lasso.points;
		if (pts.length < 2) return;

		// Draw in CSS pixels by scaling to DPR
		ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
		ctx.beginPath();
		ctx.moveTo(pts[0].cssX, pts[0].cssY);
		for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cssX, pts[i].cssY);

		if (state.lasso.kind === "ready") ctx.closePath();

		ctx.lineWidth = 2;
		ctx.stroke();
	}
}
