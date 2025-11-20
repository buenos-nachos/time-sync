/**
 * @file Avoiding concurrent test running here for the same reasons we have to
 * avoid them in the vanilla TimeSync package.
 *
 * See TimeSync.test.ts in that package for more information.
 */
import { renderHook } from "@testing-library/react";
import { describe, it } from "vitest";
import { useTimeSync, useTimeSyncRef } from "./useTimeSync";

describe(useTimeSyncRef, () => {
	it("Throws if mounted outside of a TimeSyncProvider", ({ expect }) => {
		expect(() => {
			renderHook(() => useTimeSyncRef());
		}).toThrow(
			new Error("Must call TimeSync hook from inside TimeSyncProvider"),
		);
	});

	it.skip("Lets a component subscribe from inside a side effect", ({
		expect,
	}) => {
		expect.hasAssertions();
	});

	it.skip("Lets a component get a state snapshot from inside a side effect", ({
		expect,
	}) => {
		expect.hasAssertions();
	});

	it.skip("Lets a component invalidate state from inside a side effect", ({
		expect,
	}) => {
		expect.hasAssertions();
	});
});

describe(useTimeSync, () => {
	describe("General behavior", () => {
		it.skip("Throws if mounted outside of a TimeSyncProvider", ({ expect }) => {
			expect.hasAssertions();
		});
	});

	describe("Single consumer", () => {
		describe("No transformation callback", () => {
			it.skip("Returns a new Date synchronously on mount", ({ expect }) => {
				expect.hasAssertions();
			});
		});

		describe("With transformation callback", () => {
			it.skip("Returns callback result synchronously on mount", ({
				expect,
			}) => {
				expect.hasAssertions();
			});
		});
	});

	describe("Multiple consumers on screen at same time", () => {
		it.skip("Refreshes previous consumers when new consumer mounts", ({
			expect,
		}) => {
			expect.hasAssertions();
		});
	});
});
