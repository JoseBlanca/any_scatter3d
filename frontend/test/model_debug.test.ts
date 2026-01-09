import { describe, it, expect } from "vitest";
import { makeDebugModel } from "../src/model_debug";

describe("makeDebugModel(save_changes)", () => {
	it("returns undefined (and does not throw) if save_changes() returns void while dirtyFields is non-empty", () => {
		const base: any = {
			dirtyFields: new Set([["x", 1]]),
			save_changes: () => undefined,
			get: () => undefined,
			set: () => {},
			on: () => {},
			off: () => {},
		};
		const debug = { modelChangeHandlers: [] as string[] };
		const wrapped = makeDebugModel(base, debug);

		expect(() => wrapped.save_changes()).not.toThrow();
		expect(wrapped.save_changes()).toBeUndefined();
	});
});
