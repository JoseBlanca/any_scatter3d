// test/interaction.unit.test.ts
import { describe, it, expect } from "vitest";
import type { PointerInfo } from "../src/interaction";

import {
	createInteractionState,
	setMode,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	cancelLasso,
	commitLasso,
} from "../src/interaction";

function p(
	cssX: number,
	cssY: number,
	opts?: Partial<PointerInfo>,
): PointerInfo {
	// Provide defaults; tests override only what matters.
	return {
		cssX,
		cssY,
		normDevCoordX: opts?.normDevCoordX ?? 0,
		normDevCoordY: opts?.normDevCoordY ?? 0,
		isInside: opts?.isInside ?? true,
		...opts,
	};
}

describe("interaction.ts (pure unit)", () => {
	it("starts in rotate + idle with zero sizing", () => {
		const s = createInteractionState();
		expect(s.mode).toEqual({ kind: "rotate" });
		expect(s.lasso).toEqual({ kind: "idle" });
		expect(s.lastPointer).toBeNull();
		expect(s.dpr).toBe(0);
		expect(s.pixelWidth).toBe(0);
		expect(s.pixelHeight).toBe(0);
	});

	it("setMode(rotate) always cancels lasso (single source of truth)", () => {
		const s = createInteractionState();
		setMode(s, { kind: "lasso", operation: "add" });
		onPointerDown(s, p(10, 10));
		expect(s.lasso.kind).toBe("drawing");

		setMode(s, { kind: "rotate" });
		expect(s.mode).toEqual({ kind: "rotate" });
		expect(s.lasso).toEqual({ kind: "idle" });
	});

	it("onPointerDown starts drawing only in lasso mode and only when inside", () => {
		const s = createInteractionState();

		// rotate: ignored
		onPointerDown(s, p(10, 10));
		expect(s.lasso).toEqual({ kind: "idle" });

		// lasso but outside: ignored
		setMode(s, { kind: "lasso", operation: "add" });
		onPointerDown(s, p(10, 10, { isInside: false }));
		expect(s.lasso).toEqual({ kind: "idle" });

		// lasso inside: start drawing with 1 point
		onPointerDown(s, p(10, 10, { normDevCoordX: -0.5, normDevCoordY: 0.25 }));
		expect(s.lasso.kind).toBe("drawing");
		if (s.lasso.kind === "drawing") {
			expect(s.lasso.points).toHaveLength(1);
			expect(s.lasso.points[0]).toEqual({
				cssX: 10,
				cssY: 10,
				normDevCoordX: -0.5,
				normDevCoordY: 0.25,
			});
		}
	});

	it("onPointerMove only appends points when drawing and distance >= 2px", () => {
		const s = createInteractionState();
		setMode(s, { kind: "lasso", operation: "add" });
		onPointerDown(s, p(0, 0, { normDevCoordX: 0, normDevCoordY: 0 }));

		// Move less than 2px away => ignored
		onPointerMove(s, p(1, 1, { normDevCoordX: 0.1, normDevCoordY: 0.1 }));
		expect(s.lasso.kind).toBe("drawing");
		if (s.lasso.kind === "drawing") {
			expect(s.lasso.points).toHaveLength(1);
		}

		// Exactly 2px away along x => accepted (dx^2 = 4)
		onPointerMove(s, p(2, 0, { normDevCoordX: 0.2, normDevCoordY: 0.0 }));
		if (s.lasso.kind === "drawing") {
			expect(s.lasso.points).toHaveLength(2);
			expect(s.lasso.points[1]).toMatchObject({
				cssX: 2,
				cssY: 0,
				normDevCoordX: 0.2,
				normDevCoordY: 0.0,
			});
		}
	});

	it("onPointerUp transitions drawing -> ready only in lasso mode", () => {
		const s = createInteractionState();
		setMode(s, { kind: "lasso", operation: "add" });

		// not drawing => no-op
		onPointerUp(s);
		expect(s.lasso).toEqual({ kind: "idle" });

		onPointerDown(s, p(10, 10));
		onPointerMove(s, p(12, 10)); // ensure >=2px
		expect(s.lasso.kind).toBe("drawing");

		onPointerUp(s);
		expect(s.lasso.kind).toBe("ready");
		if (s.lasso.kind === "ready") {
			expect(s.lasso.points.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("cancelLasso always returns to idle", () => {
		const s = createInteractionState();
		setMode(s, { kind: "lasso", operation: "add" });
		onPointerDown(s, p(10, 10));
		expect(s.lasso.kind).toBe("drawing");

		cancelLasso(s);
		expect(s.lasso).toEqual({ kind: "idle" });
	});

	it("commitLasso returns null unless mode=lasso and lasso=ready", () => {
		const s = createInteractionState();

		// rotate => null
		expect(commitLasso(s)).toBeNull();

		// lasso idle => null
		setMode(s, { kind: "lasso", operation: "add" });
		expect(commitLasso(s)).toBeNull();

		// lasso drawing => null
		onPointerDown(s, p(10, 10));
		expect(commitLasso(s)).toBeNull();
	});

	it("commitLasso requires >=3 points; otherwise returns null AND resets to idle", () => {
		const s = createInteractionState();
		setMode(s, { kind: "lasso", operation: "add" });

		// Create only 2 points
		onPointerDown(s, p(0, 0, { normDevCoordX: 0.0, normDevCoordY: 0.0 }));
		onPointerMove(s, p(2, 0, { normDevCoordX: 0.2, normDevCoordY: 0.0 }));
		onPointerUp(s);
		expect(s.lasso.kind).toBe("ready");

		const poly = commitLasso(s);
		expect(poly).toBeNull();
		expect(s.lasso).toEqual({ kind: "idle" });
	});

	it("commitLasso returns polygon in NDC order and resets to idle", () => {
		const s = createInteractionState();
		setMode(s, { kind: "lasso", operation: "add" });

		onPointerDown(s, p(0, 0, { normDevCoordX: -0.5, normDevCoordY: -0.5 }));
		onPointerMove(s, p(2, 0, { normDevCoordX: 0.5, normDevCoordY: -0.5 }));
		onPointerMove(s, p(2, 2, { normDevCoordX: 0.5, normDevCoordY: 0.5 }));
		onPointerUp(s);

		const poly = commitLasso(s);
		expect(poly).toEqual([
			{ x: -0.5, y: -0.5 },
			{ x: 0.5, y: -0.5 },
			{ x: 0.5, y: 0.5 },
		]);
		expect(s.lasso).toEqual({ kind: "idle" });
	});
});
