export type BuildSizeBufferParams = {
	// codes: uint16 length N, 0 = missing, 1..K = categories
	codes: Uint16Array;

	// If set, only this code is "active"
	activeCode: number | null;

	// Base size in world units (matches your current PointsMaterial.size)
	baseSize: number;

	// Multiply inactive points by this factor when activeCode != null.
	// Must be in (0, 1].
	inactiveScale: number;
};

export function buildSizeBuffer(params: BuildSizeBufferParams): Float32Array {
	const { codes, activeCode, baseSize, inactiveScale } = params;

	if (
		!(typeof baseSize === "number" && Number.isFinite(baseSize) && baseSize > 0)
	) {
		throw new Error(`baseSize must be positive finite, got ${baseSize}`);
	}
	if (
		!(
			typeof inactiveScale === "number" &&
			Number.isFinite(inactiveScale) &&
			inactiveScale > 0 &&
			inactiveScale <= 1
		)
	) {
		throw new Error(`inactiveScale must be in (0,1], got ${inactiveScale}`);
	}

	if (activeCode !== null) {
		if (!Number.isInteger(activeCode) || activeCode <= 0) {
			throw new Error(
				`activeCode must be a positive integer, got ${activeCode}`,
			);
		}
	}

	const out = new Float32Array(codes.length);

	// If there's no active category, everyone uses base size.
	if (activeCode === null) {
		out.fill(baseSize);
		return out;
	}

	for (let i = 0; i < codes.length; i++) {
		const code = codes[i] ?? 0;

		// Keep missing points at base size (consistent, and avoids "invisible missing").
		// If you want missing to shrink too, we can change it, but it must be specified.
		const isInactive = code !== 0 && code !== activeCode;
		out[i] = isInactive ? baseSize * inactiveScale : baseSize;
	}

	return out;
}
