import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

describe("test suite hygiene", () => {
	it("only render_wiring.test.ts may import ../src/index (wiring smoke test only)", () => {
		const testDir = dirname(fileURLToPath(import.meta.url));

		const files = readdirSync(testDir)
			.filter((f) => f.endsWith(".test.ts"))
			.filter(
				(f) =>
					f !== "render_wiring.test.ts" && f !== "no_index_imports.test.ts",
			);

		const offenders: string[] = [];

		for (const f of files) {
			const p = join(testDir, f);
			const src = readFileSync(p, "utf8");

			if (src.includes(`"../src/index"`) || src.includes(`'../src/index'`)) {
				offenders.push(f);
			}
		}

		expect(offenders).toEqual([]);
	});
});
