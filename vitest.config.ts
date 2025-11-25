import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.{ts,tsx}"],
		environment: "happy-dom",
		env: {
			TZ: "US/Eastern",
		},
	},
});
