import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDebugModel } from "../src/model_debug";

// dlog is a side-effect; mock it to assert one-shot behavior.
vi.mock("../src/debug", () => ({
	dlog: vi.fn(),
}));

import { dlog } from "../src/debug";

describe("makeDebugModel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it("records change:TRAIT subscriptions into debug.modelChangeHandlers", () => {
		const base: any = {
			get: () => undefined,
			set: () => {},
			save_changes: () => undefined,
			on: vi.fn(),
			off: vi.fn(),
		};

		const debug = { modelChangeHandlers: [] as string[] };
		const wrapped = makeDebugModel(base, debug);

		const cb = () => {};
		wrapped.on("change:xyz_bytes_t", cb);
		wrapped.on("change:colors_t", cb);

		expect(debug.modelChangeHandlers).toEqual(["xyz_bytes_t", "colors_t"]);
		expect(base.on).toHaveBeenCalledTimes(2);
	});

	it("when dirtyFields is non-empty and save_changes returns undefined, it logs once and returns undefined", () => {
		const base: any = {
			dirtyFields: new Set(["x"]),
			get: () => undefined,
			set: () => {},
			save_changes: () => undefined,
			on: () => {},
			off: () => {},
		};

		const debug = { modelChangeHandlers: [] as string[] };
		const wrapped = makeDebugModel(base, debug);

		// First call: logs
		const r1 = wrapped.save_changes();
		expect(r1).toBeUndefined();
		expect(dlog).toHaveBeenCalledTimes(1);

		// Second call: still undefined, but no additional logs (one-shot)
		const r2 = wrapped.save_changes();
		expect(r2).toBeUndefined();
		expect(dlog).toHaveBeenCalledTimes(1);
	});

	it("if dirtyFields is empty, it does not log even if save_changes returns undefined", () => {
		const base: any = {
			dirtyFields: new Set(),
			get: () => undefined,
			set: () => {},
			save_changes: () => undefined,
			on: () => {},
			off: () => {},
		};

		const debug = { modelChangeHandlers: [] as string[] };
		const wrapped = makeDebugModel(base, debug);

		wrapped.save_changes();
		expect(dlog).toHaveBeenCalledTimes(0);
	});
});
