import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: path.resolve(__dirname, "src/index.ts"),
			formats: ["es"],
			fileName: () => "scatter3d.js",
		},
		outDir: path.resolve(__dirname, "../src/scatter3d/static"),
		emptyOutDir: true,
		sourcemap: true,

		rollupOptions: {
			// Ensure deps like `three` are bundled into scatter3d.js
			external: [],
			output: {
				// Make sourcemap paths stable and machine-independent.
				// Avoid leaking absolute build paths into scatter3d.js.map.
				sourcemapPathTransform(sourcePath) {
					// Strip Rollup virtual-module prefix if present.
					const p = sourcePath.startsWith("\0")
						? sourcePath.slice(1)
						: sourcePath;

					// Prefer paths relative to the frontend project root (this directory).
					let rel = path.relative(__dirname, p);

					// Normalize Windows separators for consistent maps.
					rel = rel.split(path.sep).join("/");

					// If the file is outside the project root, fall back to a normalized absolute-ish path
					// (still normalized), but at least stable formatting.
					// If you prefer stricter behavior, we can make this a hard error instead.
					if (rel.startsWith("../")) {
						return p.split(path.sep).join("/");
					}

					return rel;
				},
			},
		},
	},
});
