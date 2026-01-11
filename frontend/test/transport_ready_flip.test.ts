import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeModel } from "./fake_model";
import { createTransportReadyController } from "../src/transport_ready";
import { TRAITS } from "../src/model";

describe("transport readiness handshake (unit)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("isReady tracks interactive_ready_t; onReadyChange fires on flips", () => {
		const model = new FakeModel();

		model.set(TRAITS.interactiveReady, false);
		model.set(TRAITS.clientReady, false);

		const tr = createTransportReadyController(model as any);

		expect(tr.isReady()).toBe(false);

		const cb = vi.fn();
		tr.onReadyChange(cb);

		// Flip to ready -> should notify and become ready
		model.set(TRAITS.interactiveReady, true);
		model.emit(`change:${TRAITS.interactiveReady}`);

		expect(tr.isReady()).toBe(true);
		expect(cb).toHaveBeenCalledTimes(1);

		// Flip again (true -> true) still emits if the model emits; that's ok.
		model.emit(`change:${TRAITS.interactiveReady}`);
		expect(cb).toHaveBeenCalledTimes(2);

		tr.dispose();
	});

	it("announceClientReadyOnce sets client_ready_t and calls save_changes at most once; never throws", () => {
		const model = new FakeModel();

		model.set(TRAITS.interactiveReady, false);
		model.set(TRAITS.clientReady, false);

		// Simulate a stack that throws while transport not ready.
		const saveErr = new Error("widget transport not ready");
		vi.spyOn(model, "save_changes").mockImplementation(() => {
			throw saveErr;
		});

		const onError = vi.fn();
		const tr = createTransportReadyController(model as any, { onError });

		// First call: sets trait + attempts save + catches error
		expect(() => tr.announceClientReadyOnce()).not.toThrow();
		expect(model.get(TRAITS.clientReady)).toBe(true);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBe(saveErr);

		const beforeSetCalls = model.setCalls.length;
		const beforeOnError = onError.mock.calls.length;

		// Second call: no-op (no extra set/save/error)
		expect(() => tr.announceClientReadyOnce()).not.toThrow();
		expect(model.setCalls.length).toBe(beforeSetCalls);
		expect(onError.mock.calls.length).toBe(beforeOnError);

		tr.dispose();
	});
});
