type Handler = () => void;

export class FakeModel {
	private data = new Map<string, unknown>();
	public onCalls: Array<{ event: string; cb: Handler }> = [];
	public offCalls: Array<{ event: string; cb: Handler }> = [];

	public setCalls: Array<{ key: string; value: unknown }> = [];
	public saveCalls = 0;

	get(key: string): unknown {
		return this.data.get(key);
	}

	set(key: string, value: unknown): void {
		this.data.set(key, value);
		this.setCalls.push({ key, value });
	}

	save_changes(): Promise<void> {
		this.saveCalls += 1;
		return Promise.resolve();
	}

	on(event: string, cb: Handler): void {
		this.onCalls.push({ event, cb });
	}

	off(event: string, cb: Handler): void {
		this.offCalls.push({ event, cb });
	}

	emit(event: string): void {
		for (const c of this.onCalls) {
			if (c.event === event) c.cb();
		}
	}
}
