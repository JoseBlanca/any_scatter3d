export type BytesLike =
	| ArrayBuffer
	| Uint8Array
	| DataView
	| { buffer: ArrayBuffer }; // covers some widget wrappers

export function bytesToUint8Array(x: unknown): Uint8Array {
	if (x instanceof Uint8Array) return x;
	if (x instanceof ArrayBuffer) return new Uint8Array(x);
	if (x instanceof DataView)
		return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);

	// sometimes you get an object that has a .buffer
	if (x && typeof x === "object" && "buffer" in x) {
		const b = (x as any).buffer;
		if (b instanceof ArrayBuffer) return new Uint8Array(b);
	}

	throw new Error(
		`Expected bytes-like (Uint8Array | ArrayBuffer | DataView | {buffer:ArrayBuffer}), got: ${typeof x}`,
	);
}

function requireMultipleOf(byteLength: number, n: number, what: string): void {
	if (byteLength % n !== 0) {
		throw new Error(`${what} bytes length ${byteLength} not divisible by ${n}`);
	}
}

export function uint8ArrayToBase64(u8: Uint8Array): string {
	// Avoid call stack / argument limits on large arrays by chunking.
	let bin = "";
	const CHUNK = 0x8000;

	for (let i = 0; i < u8.length; i += CHUNK) {
		const slice = u8.subarray(i, i + CHUNK);
		bin += String.fromCharCode(...slice);
	}

	return btoa(bin);
}

function alignedViewOrCopy<T>(
	u8: Uint8Array,
	bytesPerElement: number,
	makeView: (buf: ArrayBuffer, offset: number, length: number) => T,
): T {
	const byteOffset = u8.byteOffset;
	const byteLength = u8.byteLength;

	if (byteLength === 0) {
		throw new Error("Expected non-empty bytes");
	}

	// If aligned, zero-copy view.
	if (byteOffset % bytesPerElement === 0) {
		return makeView(u8.buffer, byteOffset, byteLength / bytesPerElement);
	}

	// If not aligned, copy.
	const copy = new Uint8Array(byteLength);
	copy.set(u8);
	return makeView(copy.buffer, 0, byteLength / bytesPerElement);
}

export function bytesToUint16ArrayLE(x: unknown): Uint16Array {
	const u8 = bytesToUint8Array(x);
	requireMultipleOf(u8.byteLength, 2, "uint16");
	return alignedViewOrCopy(
		u8,
		2,
		(buf, off, len) => new Uint16Array(buf, off, len),
	);
}

export function bytesToUint32ArrayLE(x: unknown): Uint32Array {
	const u8 = bytesToUint8Array(x);
	requireMultipleOf(u8.byteLength, 4, "uint32");
	return alignedViewOrCopy(
		u8,
		4,
		(buf, off, len) => new Uint32Array(buf, off, len),
	);
}

export function bytesToFloat32ArrayLE(x: unknown): Float32Array {
	const u8 = bytesToUint8Array(x);
	requireMultipleOf(u8.byteLength, 4, "float32");
	return alignedViewOrCopy(
		u8,
		4,
		(buf, off, len) => new Float32Array(buf, off, len),
	);
}

// ------------------------------
// Packed bitmask helpers (big-endian bits)
// ------------------------------

// Python side uses np.unpackbits(..., bitorder="big") and takes the first N bits.
// bit i is stored at:
//   byte = i >> 3
//   bit  = 7 - (i & 7)
export function packedMaskLength(nPoints: number): number {
	if (!Number.isInteger(nPoints) || nPoints < 0) {
		throw new Error(`invalid nPoints: ${nPoints}`);
	}
	return (nPoints + 7) >> 3;
}

export function createPackedMaskBig(nPoints: number): Uint8Array {
	return new Uint8Array(packedMaskLength(nPoints));
}

export function clearPackedMask(mask: Uint8Array): void {
	mask.fill(0);
}

export function setPackedMaskBitBig(mask: Uint8Array, index: number): void {
	if (!Number.isInteger(index)) {
		throw new Error(`index must be an integer, got: ${index}`);
	}
	if (index < 0) {
		throw new Error(`index out of range: ${index}`);
	}

	const byte = index >> 3;
	if (byte < 0 || byte >= mask.length) {
		throw new Error(
			`index out of range: ${index} (byte=${byte}, mask.length=${mask.length})`,
		);
	}
	const bit = 7 - (index & 7);
	mask[byte] |= 1 << bit;
}

export function getPackedMaskBitBig(mask: Uint8Array, index: number): boolean {
	if (!Number.isInteger(index) || index < 0) return false;
	const byte = index >> 3;
	if (byte < 0 || byte >= mask.length) return false;
	const bit = 7 - (index & 7);
	return (mask[byte] & (1 << bit)) !== 0;
}
