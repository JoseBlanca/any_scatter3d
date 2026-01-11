import { describe, it, expect } from "vitest";
import { buildColorBuffer } from "../src/color_mapping";
import type { RGB } from "../src/model";

describe("buildColorBuffer", () => {
	it("no active category: uses palette/missing exactly", () => {
		const palette: RGB[] = [
			[1, 0, 0], // code 1
			[0, 1, 0], // code 2
		];
		const missing: RGB = [0.1, 0.2, 0.3];

		const codes = new Uint16Array([0, 1, 2, 1]);

		const out = buildColorBuffer({
			codes,
			palette,
			missing,
			activeCode: null,
			inactiveDesaturateAmount: 0.7,
		});

		const got = Array.from(out);
		const exp = [0.1, 0.2, 0.3, 1, 0, 0, 0, 1, 0, 1, 0, 0];

		expect(got).toHaveLength(exp.length);
		for (let i = 0; i < exp.length; i++) {
			expect(got[i]).toBeCloseTo(exp[i], 6);
		}
	});

	it("active category set: inactive categories are desaturated deterministically", () => {
		const palette: RGB[] = [
			[1, 0, 0], // code 1
			[0, 1, 0], // code 2
		];
		const missing: RGB = [0, 0, 0];

		const codes = new Uint16Array([1, 2]);

		const out = buildColorBuffer({
			codes,
			palette,
			missing,
			activeCode: 1,
			inactiveDesaturateAmount: 1, // full desaturate => grey at luminance
		});

		// code 1 stays red
		expect(out[0]).toBe(1);
		expect(out[1]).toBe(0);
		expect(out[2]).toBe(0);

		// code 2 becomes grey at luminance of green: 0.7152
		expect(out[3]).toBeCloseTo(0.7152, 6);
		expect(out[4]).toBeCloseTo(0.7152, 6);
		expect(out[5]).toBeCloseTo(0.7152, 6);
	});

	it("missing palette entry throws (no silent fallback)", () => {
		const palette: RGB[] = [[1, 0, 0]]; // only code 1 exists
		const missing: RGB = [0, 0, 0];
		const codes = new Uint16Array([2]); // code 2 => missing palette

		expect(() =>
			buildColorBuffer({
				codes,
				palette,
				missing,
				activeCode: null,
				inactiveDesaturateAmount: 0.7,
			}),
		).toThrow(/No color for code=2/);
	});
});
