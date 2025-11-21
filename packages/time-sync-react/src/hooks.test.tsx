/**
 * @file Avoiding concurrent test running here for the same reasons we have to
 * avoid them in the vanilla TimeSync package.
 *
 * See TimeSync.test.ts in that package for more information.
 *
 * Also realizing that React Testing Library can't even support concurrent tests
 * right now because it has no way for you to pass the test-scoped expect
 * context into the test calls. They all implicitly use the global expect.
 */
import { render, renderHook, screen } from "@testing-library/react";
import { type FC, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshRates } from "../../time-sync/src";
import { useTimeSync, useTimeSyncRef } from "./hooks";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.skip(useTimeSyncRef, () => {
	it("Throws if mounted outside of a TimeSyncProvider", () => {
		expect(() => {
			renderHook(() => useTimeSyncRef());
		}).toThrow(
			new Error("Must call TimeSync hook from inside TimeSyncProvider"),
		);
	});

	it("Lets component subscribe from inside side effect", async () => {
		const SampleComponent: FC = () => {
			const [date, setDate] = useState<Date>();
			const timeSync = useTimeSyncRef();

			useEffect(() => {
				const unsub = timeSync.subscribe({
					onUpdate: (newDate) => setDate(newDate),
					targetRefreshIntervalMs: refreshRates.oneSecond,
				});
				return unsub;
			}, [timeSync]);

			if (date === undefined) {
				return null;
			}

			return (
				<time dateTime={date.toISOString()}>
					The date is {date.toDateString()}
				</time>
			);
		};

		const initialDate = new Date("September 2, 2023");
		vi.setSystemTime(initialDate);

		render(<SampleComponent />, {
			wrapper: ({ children }) => (
				<TimeSyncProvider>{children}</TimeSyncProvider>
			),
		});

		await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
		await screen.findByRole("time", {
			name: /The time is Sat Sep 02 2023/i,
		});
	});

	it("Lets a component get a state snapshot from inside a side effect", ({
		expect,
	}) => {
		expect.hasAssertions();
	});

	it("Lets a component invalidate state from inside a side effect", ({
		expect,
	}) => {
		expect.hasAssertions();
	});
});

describe.skip(useTimeSync, () => {
	describe("General behavior", () => {
		it("Throws if mounted outside of a TimeSyncProvider", ({ expect }) => {
			expect.hasAssertions();
		});
	});

	describe("Single consumer", () => {
		describe("No transformation callback", () => {
			it("Returns a new Date synchronously on mount", ({ expect }) => {
				expect.hasAssertions();
			});
		});

		describe("With transformation callback", () => {
			it("Returns callback result synchronously on mount", ({ expect }) => {
				expect.hasAssertions();
			});
		});
	});

	describe("Multiple consumers on screen at same time", () => {
		it("Refreshes previous consumers when new consumer mounts", ({
			expect,
		}) => {
			expect.hasAssertions();
		});
	});
});
