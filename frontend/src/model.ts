export type WidgetModel = {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
	save_changes(): void;
	on(event: string, cb: () => void): void;
	off(event: string, callback: () => void): void;
};
