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

	it("announceClientReadyOnce retries if save_changes throws; marks announced only after success", () => {
	const model = new FakeModel();

	model.set(TRAITS.interactiveReady, false);
	model.set(TRAITS.clientReady, false);

	// Control time so we can pass the 250ms throttle deterministically.
	let now = 0;
	const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);

	const saveErr = new Error("widget transport not ready");

	// First call throws, second succeeds.
	const saveSpy = vi
		.spyOn(model, "save_changes")
		.mockImplementationOnce(() => {
		throw saveErr;
		})
		.mockImplementationOnce(() => undefined);

	const onError = vi.fn();
	const tr = createTransportReadyController(model as any, { onError });

	// 1) First attempt: sets trait, tries save, catches, calls onError
	expect(() => tr.announceClientReadyOnce()).not.toThrow();
	expect(model.get(TRAITS.clientReady)).toBe(false);
	expect(saveSpy).toHaveBeenCalledTimes(1);
	expect(onError).toHaveBeenCalledTimes(1);
	expect(onError.mock.calls[0][0]).toBe(saveErr);

	// 2) Second attempt should RETRY (because first failed)
	now = 300; // > 250ms throttle
	expect(() => tr.announceClientReadyOnce()).not.toThrow();
	expect(saveSpy).toHaveBeenCalledTimes(2);
	expect(onError).toHaveBeenCalledTimes(1); // no new error
	expect(model.get(TRAITS.clientReady)).toBe(true);

	// 3) Without Python ack, further calls may still attempt (marimo reality)
	now = 600;
	expect(() => tr.announceClientReadyOnce()).not.toThrow();
	expect(saveSpy).toHaveBeenCalledTimes(3);

	// 4) Once Python acks (interactive_ready_t=true), further calls must be a no-op
	model.set(TRAITS.interactiveReady, true);
	model.emit(`change:${TRAITS.interactiveReady}`);

	now = 900;
	expect(() => tr.announceClientReadyOnce()).not.toThrow();
	expect(saveSpy).toHaveBeenCalledTimes(3);

	tr.dispose();
	nowSpy.mockRestore();
	});


});
