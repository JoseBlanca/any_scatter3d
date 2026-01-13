import { describe, it, expect } from "vitest";
import { buildSizeBuffer } from "../src/size_mapping";

describe("buildSizeBuffer", () => {
	it("no active category: all points use baseSize", () => {
		const out = buildSizeBuffer({
			codes: new Uint16Array([0, 1, 2, 2]),
			activeCode: null,
			baseSize: 0.05,
			inactiveScale: 0.3,
		});
		for (const v of out) {
			expect(v).toBeCloseTo(0.05, 6);
		}
	});

	it("active category set: inactive (non-missing) points are scaled down", () => {
		const out = buildSizeBuffer({
			codes: new Uint16Array([0, 1, 2, 1]),
			activeCode: 1,
			baseSize: 0.1,
			inactiveScale: 0.25,
		});
		// code 1 stays baseSize; everything else (including code 0) scales down
		const exp = [0.025, 0.1, 0.025, 0.1];
		expect(out).toHaveLength(exp.length);
		for (let i = 0; i < exp.length; i++) {
			expect(out[i]).toBeCloseTo(exp[i], 6);
		}
	});

	it("active category set: unassigned points (code 0) are scaled down too", () => {
		const out = buildSizeBuffer({
			codes: new Uint16Array([1, 0, 2, 0, 1]),
			activeCode: 1,
			baseSize: 0.1,
			inactiveScale: 0.25,
		});

		// active (code 1) stays baseSize
		// non-active categories (code 2) scale down
		// unassigned (code 0) must ALSO scale down (this is the bug)
		const exp = [0.1, 0.025, 0.025, 0.025, 0.1];

		expect(out).toHaveLength(exp.length);
		for (let i = 0; i < exp.length; i++) {
			expect(out[i]).toBeCloseTo(exp[i], 6);
		}
	});

	it("rejects invalid inactiveScale", () => {
		expect(() =>
			buildSizeBuffer({
				codes: new Uint16Array([1]),
				activeCode: 1,
				baseSize: 0.1,
				inactiveScale: 0,
			}),
		).toThrow(/inactiveScale/);
	});
});
