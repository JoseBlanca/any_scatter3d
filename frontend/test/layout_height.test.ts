import { describe, it, expect } from "vitest";
import { computeEffectiveHeightPx } from "../src/layout_height";

describe("computeEffectiveHeightPx", () => {
	it("subtracts overhead inside maxAllowedPx budget (prevents container padding overflow)", () => {
		// Your real numbers:
		// maxAllowedPx = 610
		// paddingTop + paddingBottom ~= 28.8
		// usable inner height ~= 581.2
		const next = computeEffectiveHeightPx({
			desiredPx: 800,
			maxAllowedPx: 610,
			overheadPx: 28.8,
		});

		// We want root height to fit *inside* the max-height budget
		// after accounting for container overhead.
		expect(next).toBeCloseTo(581.2, 3);
	});

	it("keeps legacy behavior when overheadPx=0", () => {
		const next = computeEffectiveHeightPx({
			desiredPx: 800,
			maxAllowedPx: 610,
			overheadPx: 0,
		});
		expect(next).toBe(610);
	});
});
