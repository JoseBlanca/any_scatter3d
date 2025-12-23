import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: path.resolve(__dirname, "src/index.ts"),
			formats: ["es"],
			fileName: () => "scatter3d.js",
		},
		outDir: path.resolve(__dirname, "../src/any_scatter3d/static"),
		emptyOutDir: true,
		sourcemap: true,
	},
});
