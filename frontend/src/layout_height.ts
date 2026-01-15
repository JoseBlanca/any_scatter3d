// layout_height.ts
// Pure sizing policy for the widget.
// No DOM. No marimo assumptions.

export type ComputeEffectiveHeightParams = {
	desiredPx: number;
	maxAllowedPx: number | null;
	overheadPx: number;
};

/**
 * Compute the effective widget height in CSS pixels.
 *
 * Rule:
 * - If maxAllowedPx is null: return desiredPx.
 * - Else: return min(desiredPx, maxAllowedPx).
 *
 * Errors:
 * - desiredPx must be finite and > 0.
 * - maxAllowedPx must be null or finite and > 0.
 */
export function computeEffectiveHeightPx(
	params: ComputeEffectiveHeightParams,
): number {
	const { desiredPx, maxAllowedPx, overheadPx } = params;

	if (!(typeof desiredPx === "number" && Number.isFinite(desiredPx))) {
		throw new Error(`desiredPx must be finite number, got ${desiredPx}`);
	}
	if (desiredPx <= 0) {
		throw new Error(`desiredPx must be > 0, got ${desiredPx}`);
	}

	if (!(typeof overheadPx === "number" && Number.isFinite(overheadPx))) {
		throw new Error(`overheadPx must be finite number, got ${overheadPx}`);
	}
	if (overheadPx < 0) {
		throw new Error(`overheadPx must be >= 0, got ${overheadPx}`);
	}

	if (maxAllowedPx !== null) {
		if (!(typeof maxAllowedPx === "number" && Number.isFinite(maxAllowedPx))) {
			throw new Error(
				`maxAllowedPx must be null or finite number, got ${maxAllowedPx}`,
			);
		}
		if (maxAllowedPx <= 0) {
			throw new Error(`maxAllowedPx must be null or > 0, got ${maxAllowedPx}`);
		}

		const budget = maxAllowedPx - overheadPx;
		if (!(budget > 0)) {
			throw new Error(
				`maxAllowedPx (${maxAllowedPx}) minus overheadPx (${overheadPx}) must be > 0`,
			);
		}
		return Math.min(desiredPx, budget);
	}

	return desiredPx;
}
