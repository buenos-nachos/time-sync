import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.{ts,tsx}"],
		environment: "happy-dom",
		env: {
			// This is necessary to prevent flakes when running some tests in
			// GitHub Actions. Date objects don't give you an option to
			// configure the device time zone, so you have to do it at the
			// environment level
			TZ: "US/Eastern",
		},
	},
});
