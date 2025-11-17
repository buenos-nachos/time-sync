import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { newReadonlyDate } from "./readonlyDate";
import {
	REFRESH_ONE_HOUR,
	REFRESH_ONE_MINUTE,
	REFRESH_ONE_SECOND,
	TimeSync,
	type TimeSyncSnapshot,
} from "./TimeSync";

// For better or worse, this is a personally meaningful date to me
const defaultDateString = "October 27, 2025";

const epsilonThreshold = 0.0001;

function initializeTime(dateString: string = defaultDateString): Date {
	const sourceDate = new Date(dateString);
	vi.setSystemTime(sourceDate);
	vi.useFakeTimers();
	return newReadonlyDate(sourceDate);
}

const sampleLiveRefreshRates: readonly number[] = [
	REFRESH_ONE_SECOND,
	REFRESH_ONE_MINUTE,
	REFRESH_ONE_HOUR,
];

const sampleInvalidIntervals: readonly number[] = [
	Number.NaN,
	Number.NEGATIVE_INFINITY,
	0,
	-42,
	470.53,
];

type Writeable<T> = { -readonly [Key in keyof T]: T[Key] };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.concurrent(TimeSync.name, () => {
	describe("Subscriptions: default behavior", () => {
		it("Never auto-updates state while there are zero subscribers", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const initialSnap = sync.getStateSnapshot().dateSnapshot;
			expect(initialSnap).toEqual(initialDate);

			await vi.advanceTimersByTimeAsync(5 * REFRESH_ONE_SECOND);
			const newSnap1 = sync.getStateSnapshot().dateSnapshot;
			expect(newSnap1).toEqual(initialSnap);

			await vi.advanceTimersByTimeAsync(500 * REFRESH_ONE_SECOND);
			const newSnap2 = sync.getStateSnapshot().dateSnapshot;
			expect(newSnap2).toEqual(initialSnap);
		});

		it("Lets a single system subscribe to updates", async ({ expect }) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const onUpdate = vi.fn();

			for (const rate of sampleLiveRefreshRates) {
				const unsub = sync.subscribe({
					onUpdate,
					targetRefreshIntervalMs: rate,
				});
				expect(onUpdate).not.toHaveBeenCalled();

				const dateBefore = sync.getStateSnapshot().dateSnapshot;
				await vi.advanceTimersByTimeAsync(rate);
				const dateAfter = sync.getStateSnapshot().dateSnapshot;
				expect(onUpdate).toHaveBeenCalledTimes(1);
				expect(onUpdate).toHaveBeenCalledWith(dateAfter);

				const diff = dateAfter.getMilliseconds() - dateBefore.getMilliseconds();
				const threshold = Math.abs(diff - rate);
				expect(threshold).toBeLessThanOrEqual(epsilonThreshold);

				unsub();
				onUpdate.mockRestore();
			}
		});

		it("Lets multiple subscribers subscribe to updates", ({ expect }) => {
			expect.hasAssertions();
		});

		// This is really important behavior for the React bindings. Those use
		// useSyncExternalStore under the hood, which require that you always
		// return out the same value by reference every time React tries to pull
		// a value from an external state source. Otherwise the hook will keep
		// pulling the values over and over again until it gives up and throws
		// a runtime error
		it("Exposes the exact same date value (by reference) to all subscribers on each update tick", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Throws an error if provided subscription interval is not a positive integer", ({
			expect,
		}) => {
			const sync = new TimeSync();
			const dummyFunction = vi.fn();

			for (const i of sampleInvalidIntervals) {
				expect(() => {
					void sync.subscribe({
						targetRefreshIntervalMs: i,
						onUpdate: dummyFunction,
					});
				}).toThrow(
					`TimeSync refresh interval must be a positive integer (received ${i}ms)`,
				);
			}
		});

		it("Dispatches updates to all subscribers based on fastest interval specified", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Calls onUpdate callback one time total if callback is registered multiple times for the same time interval", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Calls onUpdate callback one time total if callback is registered multiple times for different time intervals", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Calls onUpdate callback one time total if callback is registered multiple times with a mix of redundant/different intervals", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Lets an external system unsubscribe", ({ expect }) => {
			expect.hasAssertions();
		});

		it("Slows updates down to the second-fastest interval when the all subscribers for the fastest interval unsubscribe", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		/**
		 * Was really hard to describe this in a single sentence, but basically:
		 * 1. Let's say that we have subscribers A and B. A subscribes for 500ms
		 *    and B subscribes for 1000ms.
		 * 2. At 450ms, A unsubscribes.
		 * 3. Rather than starting the timer over, a one-time 'pseudo-timeout'
		 *    is kicked off for the delta between the elapsed time and B (650ms)
		 * 4. After the timeout resolves, updates go back to happening on an
		 *    interval of 1000ms.
		 */
		it("Does not completely start next interval over from scratch if fastest subscription is removed halfway through update", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Immediately notifies subscribers if new refresh interval is added that is less than or equal to the time since the last update", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Does not fully remove an onUpdate callback if multiple systems use it to subscribe, and only one system unsubscribes", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Automatically updates the date snapshot after the very first subscription is received, regardless of specified refresh interval", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Does not ever dispatch updates if all subscribers specify an update interval of positive infinity", ({
			expect,
		}) => {
			expect.hasAssertions();
		});
	});

	describe("Subscriptions: custom `minimumRefreshIntervalMs` value", () => {
		it("Rounds up target intervals to custom min interval", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({
				initialDate,
				minimumRefreshIntervalMs: REFRESH_ONE_HOUR,
			});

			const onUpdate = vi.fn();
			void sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: REFRESH_ONE_MINUTE,
			});

			await vi.advanceTimersByTimeAsync(REFRESH_ONE_MINUTE);
			expect(onUpdate).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(REFRESH_ONE_HOUR);
			expect(onUpdate).toHaveBeenCalledTimes(1);
		});

		it("Throws if custom min interval is not a positive integer", ({
			expect,
		}) => {
			for (const i of sampleInvalidIntervals) {
				expect(() => {
					void new TimeSync({ minimumRefreshIntervalMs: i });
				}).toThrow(
					`Minimum refresh interval must be a positive integer (received ${i}ms)`,
				);
			}
		});
	});

	describe("State snapshots", () => {
		it("Lets external system pull snapshot without subscribing", ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const minimumRefreshIntervalMs = 5_000_000;
			const sync = new TimeSync({ initialDate, minimumRefreshIntervalMs });

			const snap = sync.getStateSnapshot();
			expect(snap).toEqual<TimeSyncSnapshot>({
				dateSnapshot: initialDate,
				isDisposed: false,
				isFrozen: false,
				subscriberCount: 0,
				minimumRefreshIntervalMs: minimumRefreshIntervalMs,
			});
		});

		it("Reflects the minimum refresh interval used on init", ({ expect }) => {
			const sync = new TimeSync({ minimumRefreshIntervalMs: REFRESH_ONE_HOUR });
			const snap = sync.getStateSnapshot();
			expect(snap.minimumRefreshIntervalMs).toBe(REFRESH_ONE_HOUR);
		});

		// This behavior is super, super important for the React bindings. The
		// bindings rely on useSyncExternalStore, which will pull from whatever
		// is bound to it multiple times in dev mode. That ensures that React
		// can fudge the rules and treat it like a pure value, but if it gets
		// back different references, it will keep pulling over and over until
		// it gives up and blows up the entire app.
		it("Always gives back the same snapshot by reference if it's pulled synchronously multiple times", ({
			expect,
		}) => {
			const sync = new TimeSync();
			const initialSnap = sync.getStateSnapshot();

			for (let i = 0; i < 100; i++) {
				const newSnap = sync.getStateSnapshot();
				expect(newSnap).toEqual(initialSnap);
			}
		});

		it("Does not mutate old snapshots when a new update is queued for subscribers", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const initialSnap = sync.getStateSnapshot();

			const onUpdate = vi.fn();
			void sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: REFRESH_ONE_HOUR,
			});
			await vi.advanceTimersByTimeAsync(REFRESH_ONE_HOUR);

			expect(onUpdate).toHaveBeenCalledTimes(1);
			expect(onUpdate).toHaveBeenCalledWith(expect.any(Date));

			const newSnap = sync.getStateSnapshot();
			expect(newSnap).not.toEqual(initialSnap);
		});

		it("Does not mutate old snapshot when TimeSync state is invalidated", async ({
			expect,
		}) => {
			const sync = new TimeSync();
			const initialSnap = sync.getStateSnapshot();

			await vi.advanceTimersByTimeAsync(REFRESH_ONE_HOUR);
			sync.invalidateState({ notificationBehavior: "always" });
			const newSnap = sync.getStateSnapshot();
			expect(newSnap).not.toEqual(initialSnap);
		});

		it("Provides accurate count of active subscriptions as it changes over time", ({
			expect,
		}) => {
			const sync = new TimeSync();
			const snap = sync.getStateSnapshot();
			expect(snap.subscriberCount).toBe(0);

			const dummyOnUpdate = vi.fn();
			for (let i = 1; i <= 10; i++) {
				void sync.subscribe({
					onUpdate: dummyOnUpdate,
					targetRefreshIntervalMs: REFRESH_ONE_HOUR,
				});

				const newSnap = sync.getStateSnapshot();
				expect(newSnap.subscriberCount).toBe(i);
			}
		});

		it("Does not mutate old snapshots when new subscription is added or removed", ({
			expect,
		}) => {
			const sync = new TimeSync();
			const initialSnap = sync.getStateSnapshot();

			const unsub = sync.subscribe({
				targetRefreshIntervalMs: REFRESH_ONE_HOUR,
				onUpdate: vi.fn(),
			});
			const afterAdd = sync.getStateSnapshot();
			expect(afterAdd.subscriberCount).toBe(1);
			expect(afterAdd).not.toEqual(initialSnap);

			unsub();
			const afterRemove = sync.getStateSnapshot();
			expect(afterRemove.subscriberCount).toBe(0);
			expect(afterRemove).not.toEqual(initialSnap);
			expect(afterRemove).not.toEqual(afterAdd);
		});

		it("Indicates frozen status", ({ expect }) => {
			const normalSync = new TimeSync();
			const normalSnap = normalSync.getStateSnapshot();
			expect(normalSnap.isFrozen).toBe(false);

			const frozenSync = new TimeSync({ freezeUpdates: true });
			const frozenSnap = frozenSync.getStateSnapshot();
			expect(frozenSnap.isFrozen).toBe(true);
		});

		it("Indicates disposed status", ({ expect }) => {
			const sync = new TimeSync();
			const oldSnap = sync.getStateSnapshot();
			expect(oldSnap.isDisposed).toBe(false);

			sync.dispose();
			const newSnap = sync.getStateSnapshot();
			expect(newSnap.isDisposed).toBe(true);
		});

		it("Prevents mutating properties at runtime", ({ expect }) => {
			const sync = new TimeSync();

			// We have readonly modifiers on the types, but we need to make sure
			// nothing can break at runtime
			const snap = sync.getStateSnapshot() as Writeable<TimeSyncSnapshot>;
			const copyBeforeMutations = { ...snap };
			const mutationSource: TimeSyncSnapshot = {
				dateSnapshot: newReadonlyDate("April 1, 1970"),
				isDisposed: true,
				isFrozen: true,
				minimumRefreshIntervalMs: Number.POSITIVE_INFINITY,
				subscriberCount: Number.POSITIVE_INFINITY,
			};

			snap.dateSnapshot = mutationSource.dateSnapshot;
			snap.isDisposed = mutationSource.isDisposed;
			snap.isFrozen = mutationSource.isFrozen;
			snap.subscriberCount = mutationSource.subscriberCount;
			snap.minimumRefreshIntervalMs = mutationSource.minimumRefreshIntervalMs;

			expect(snap).toEqual(copyBeforeMutations);
		});
	});

	describe("Invalidating state", () => {
		it("Supports onChange behavior (only notifies subscribers if time meaningfully changed)", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Defaults to onChange notification behavior", ({ expect }) => {
			expect.hasAssertions();
		});

		it("Accepts custom staleness threshold for onChange behavior", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Defaults to staleness threshold of 0", ({ expect }) => {
			expect.hasAssertions();
		});

		it("Throws when provided a staleness threshold that is neither a positive integer nor zero", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Supports invalidating state without notifying anything", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const initialSnap = sync.getStateSnapshot();

			const onUpdate = vi.fn();
			void sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: REFRESH_ONE_HOUR,
			});

			await vi.advanceTimersByTimeAsync(REFRESH_ONE_MINUTE);
			sync.invalidateState({ notificationBehavior: "never" });
			expect(onUpdate).not.toHaveBeenCalled();

			const newSnap = sync.getStateSnapshot();
			expect(newSnap).not.toEqual(initialSnap);
		});

		it("Can force-notify subscribers, even if state did not change", ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const initialSnap = sync.getStateSnapshot();

			let ejectedDate!: Date;
			const onUpdate = vi.fn((d: Date) => {
				ejectedDate = d;
			});

			void sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: REFRESH_ONE_HOUR,
			});

			sync.invalidateState({ notificationBehavior: "always" });
			expect(onUpdate).toHaveBeenCalledTimes(1);

			const newSnap = sync.getStateSnapshot();
			expect(newSnap).not.toEqual(initialSnap);
			expect(newSnap.dateSnapshot).toEqual(ejectedDate);
		});
	});

	describe("Disposing of a TimeSync instance", () => {
		it("Clears active interval", ({ expect }) => {
			expect.hasAssertions();
		});

		it("Automatically unsubscribes everything", async ({ expect }) => {
			const sync = new TimeSync();
			const sharedOnUpdate = vi.fn();

			for (let i = 0; i < 100; i++) {
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: REFRESH_ONE_MINUTE,
				});
			}

			const oldSnap = sync.getStateSnapshot();
			expect(oldSnap.subscriberCount).toBe(100);

			sync.dispose();
			const newSnap = sync.getStateSnapshot();
			expect(newSnap.isDisposed).toBe(true);
			expect(newSnap.subscriberCount).toBe(0);

			await vi.advanceTimersByTimeAsync(REFRESH_ONE_MINUTE);
			expect(sharedOnUpdate).not.toHaveBeenCalled();
		});

		it("Turns future subscriptions into no-ops", async ({ expect }) => {
			const sync = new TimeSync();
			sync.dispose();

			const onUpdate = vi.fn();
			const unsub = sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: REFRESH_ONE_MINUTE,
			});

			const snap1 = sync.getStateSnapshot();
			expect(snap1.subscriberCount).toBe(0);

			await vi.advanceTimersByTimeAsync(2 * REFRESH_ONE_MINUTE);
			expect(onUpdate).not.toHaveBeenCalled();

			// Doing unsub assertion just to be extra safe
			unsub();
			const snap2 = sync.getStateSnapshot();
			expect(snap2.subscriberCount).toBe(0);
		});
	});

	// The intention with the frozen status is that once set on init, there
	// should be no way to make it un-frozen – a consumer would need to create a
	// fresh instance from scratch. Not sure how to codify that in tests yet.
	describe("Freezing updates on init", () => {
		it("Never updates internal state, no matter how many subscribers susbcribe", ({
			expect,
		}) => {
			const sync = new TimeSync({ freezeUpdates: true });
			const dummyOnUpdate = vi.fn();

			for (let i = 0; i < 1000; i++) {
				void sync.subscribe({
					onUpdate: dummyOnUpdate,
					targetRefreshIntervalMs: REFRESH_ONE_MINUTE,
				});
			}

			const snap = sync.getStateSnapshot();
			expect(snap.subscriberCount).toBe(0);
		});
	});
});
