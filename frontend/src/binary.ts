export type BytesLike =
	| ArrayBuffer
	| Uint8Array
	| DataView
	| { buffer: ArrayBuffer } // covers some widget wrappers
	| string; // fallback: base64 (if your framework serializes bytes that way)

function base64ToUint8Array(b64: string): Uint8Array {
	// Browser-safe base64 decode
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

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

	if (typeof x === "string") {
		return base64ToUint8Array(x);
	}

	return new Uint8Array(0);
}

export function bytesToUint32ArrayLE(x: unknown): Uint32Array {
	const u8 = bytesToUint8Array(x);
	const byteOffset = u8.byteOffset;
	const byteLength = u8.byteLength;

	if (byteLength % 4 !== 0) {
		throw new Error(`codes bytes length ${byteLength} not divisible by 4`);
	}

	// If aligned, zero-copy view. If not aligned, copy.
	if (byteOffset % 4 === 0) {
		return new Uint32Array(u8.buffer, byteOffset, byteLength / 4);
	}

	const copy = new Uint8Array(byteLength);
	copy.set(u8);
	return new Uint32Array(copy.buffer);
}
