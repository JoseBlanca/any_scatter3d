import { describe, it, expect } from "vitest";
import {
	createInteractionState,
	setMode,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	commitLasso,
	type PolygonNdc,
} from "../src/interaction";
import { pointerInfoFromEvent } from "../src/view";

// Helper: stable DOMRect-like object for jsdom/happy-dom.
function mockRect({
	left,
	top,
	width,
	height,
}: {
	left: number;
	top: number;
	width: number;
	height: number;
}) {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

function makePointerEvent(clientX: number, clientY: number) {
	// PointerEvent may not exist in some test envs; MouseEvent works for our needs.
	const Ev: any =
		(globalThis as any).PointerEvent ?? (globalThis as any).MouseEvent;
	return new Ev("pointermove", { clientX, clientY, bubbles: true });
}

describe("lasso NDC mapping", () => {
	it("pointerInfoFromEvent maps canvas corners and center to expected NDC", () => {
		const canvas = document.createElement("canvas");

		// Canvas positioned at (10, 20) with size 400x300 CSS px.
		canvas.getBoundingClientRect = () =>
			mockRect({ left: 10, top: 20, width: 400, height: 300 });

		// top-left corner inside canvas => x=-1, y=+1 (note y flipped)
		{
			const ev = makePointerEvent(10, 20); // exactly at rect.left/top
			const p = pointerInfoFromEvent(ev, canvas);
			expect(p.isInside).toBe(true);
			expect(p.normDevCoordX).toBeCloseTo(-1);
			expect(p.normDevCoordY).toBeCloseTo(1);
		}

		// center => (0,0)
		{
			const ev = makePointerEvent(10 + 200, 20 + 150);
			const p = pointerInfoFromEvent(ev, canvas);
			expect(p.isInside).toBe(true);
			expect(p.normDevCoordX).toBeCloseTo(0);
			expect(p.normDevCoordY).toBeCloseTo(0);
		}

		// bottom-right corner inside canvas => x=+1, y=-1
		{
			const ev = makePointerEvent(10 + 400, 20 + 300);
			const p = pointerInfoFromEvent(ev, canvas);
			expect(p.isInside).toBe(true);
			expect(p.normDevCoordX).toBeCloseTo(1);
			expect(p.normDevCoordY).toBeCloseTo(-1);
		}
	});

	it("commitLasso returns polygon points equal to captured NDC path", () => {
		const canvas = document.createElement("canvas");
		canvas.getBoundingClientRect = () =>
			mockRect({ left: 0, top: 0, width: 400, height: 300 });

		const state = createInteractionState();
		setMode(state, { kind: "lasso", operation: "add" });

		// Draw a rectangle well inside the canvas.
		// Use moves spaced far enough apart (> MIN_LASSO_DIST_BETWEEN_POINTS=2).
		const ev1 = makePointerEvent(50, 50);
		const ev2 = makePointerEvent(350, 50);
		const ev3 = makePointerEvent(350, 250);
		const ev4 = makePointerEvent(50, 250);

		onPointerDown(state, pointerInfoFromEvent(ev1, canvas));
		onPointerMove(state, pointerInfoFromEvent(ev2, canvas));
		onPointerMove(state, pointerInfoFromEvent(ev3, canvas));
		onPointerMove(state, pointerInfoFromEvent(ev4, canvas));
		onPointerUp(state);

		const poly = commitLasso(state);
		expect(poly).not.toBeNull();

		const p1 = pointerInfoFromEvent(ev1, canvas);
		const p2 = pointerInfoFromEvent(ev2, canvas);
		const p3 = pointerInfoFromEvent(ev3, canvas);
		const p4 = pointerInfoFromEvent(ev4, canvas);

		const expected: PolygonNdc = [
			{ x: p1.normDevCoordX, y: p1.normDevCoordY },
			{ x: p2.normDevCoordX, y: p2.normDevCoordY },
			{ x: p3.normDevCoordX, y: p3.normDevCoordY },
			{ x: p4.normDevCoordX, y: p4.normDevCoordY },
		];

		// Exact equality is OK here because both sides come from the same function,
		// but keep it robust in case you change calculations later.
		expect(poly!.length).toBe(expected.length);
		for (let i = 0; i < expected.length; i++) {
			expect(poly![i]!.x).toBeCloseTo(expected[i]!.x);
			expect(poly![i]!.y).toBeCloseTo(expected[i]!.y);
		}
	});
});
