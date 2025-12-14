import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "src/index.ts",
	outDir: "dist",
	platform: "neutral",
	dts: true,
	sourcemap: false,
	format: ["esm"],
});
