import { describe, it, expect } from "vitest";
import { computeEffectiveHeightPx } from "../src/layout_height";

describe("layout_height.computeEffectiveHeightPx", () => {
	it("returns desiredPx when maxAllowedPx is null", () => {
		expect(
			computeEffectiveHeightPx({
				desiredPx: 800,
				maxAllowedPx: null,
				overheadPx: 0,
			}),
		).toBe(800);
	});

	it("returns min(desiredPx, maxAllowedPx - overheadPx) when maxAllowedPx is provided", () => {
		expect(
			computeEffectiveHeightPx({
				desiredPx: 800,
				maxAllowedPx: 500,
				overheadPx: 20,
			}),
		).toBe(480);
	});

	it("throws when maxAllowedPx - overheadPx is not > 0", () => {
		expect(() =>
			computeEffectiveHeightPx({
				desiredPx: 800,
				maxAllowedPx: 10,
				overheadPx: 10,
			}),
		).toThrow();
	});
});
