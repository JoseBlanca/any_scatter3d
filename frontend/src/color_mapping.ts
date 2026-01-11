import type { RGB } from "./model";

function clamp01(x: number): number {
	if (!Number.isFinite(x)) throw new Error("Non-finite color component");
	if (x < 0) return 0;
	if (x > 1) return 1;
	return x;
}

function luminance(rgb: RGB): number {
	// sRGB luminance coefficients (no gamma correction; consistent & fast)
	return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function desaturate(rgb: RGB, amount: number): RGB {
	const a = clamp01(amount);
	const y = luminance(rgb);
	const out: RGB = [
		rgb[0] * (1 - a) + y * a,
		rgb[1] * (1 - a) + y * a,
		rgb[2] * (1 - a) + y * a,
	];
	return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
}

export type BuildColorBufferParams = {
	// codes: uint16 length N, where 0 = missing, 1..K correspond to palette[0..K-1]
	codes: Uint16Array;
	palette: RGB[];
	missing: RGB;

	// If set, only points with this code are "active". Others are desaturated.
	activeCode: number | null;

	// 0..1, higher => more grey for inactive
	inactiveDesaturateAmount: number;
};

export function buildColorBuffer(params: BuildColorBufferParams): Float32Array {
	const { codes, palette, missing, activeCode, inactiveDesaturateAmount } =
		params;

	if (activeCode !== null) {
		if (!Number.isInteger(activeCode) || activeCode <= 0) {
			throw new Error(
				`activeCode must be a positive integer, got ${activeCode}`,
			);
		}
	}

	const out = new Float32Array(codes.length * 3);

	for (let i = 0; i < codes.length; i++) {
		const code = codes[i] ?? 0;
		const j = i * 3;

		if (code === 0) {
			out[j] = missing[0];
			out[j + 1] = missing[1];
			out[j + 2] = missing[2];
			continue;
		}

		const idx = code - 1;
		const rgb = palette[idx];
		if (!rgb) {
			throw new Error(
				`No color for code=${code} (palette length=${palette.length}); expected palette[${idx}]`,
			);
		}

		const isInactive = activeCode !== null && code !== activeCode;
		const c = isInactive ? desaturate(rgb, inactiveDesaturateAmount) : rgb;

		out[j] = c[0];
		out[j + 1] = c[1];
		out[j + 2] = c[2];
	}

	return out;
}
