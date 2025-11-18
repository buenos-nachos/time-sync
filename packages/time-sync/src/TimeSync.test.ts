import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { newReadonlyDate } from "./readonlyDate";
import { refreshRates, type Snapshot, TimeSync } from "./TimeSync";

type Writeable<T> = { -readonly [Key in keyof T]: T[Key] };

// For better or worse, this is a personally meaningful date to me
const defaultDateString = "October 27, 2025";

function initializeTime(dateString: string = defaultDateString): Date {
	const sourceDate = new Date(dateString);
	vi.setSystemTime(sourceDate);
	return newReadonlyDate(sourceDate);
}

beforeEach(() => {
	/**
	 * @todo 2025-11-17 - Once the tests are working, look into whether using
	 * the `now` property could help clean up some of the setup.
	 */
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

/**
 * Unfortunately, because the tests make extensive use of vi's mocking, these
 * tests are a bad candidate for concurrent running. There's a very high risk of
 * all the fake timer setup and teardown calls getting in each other's way.
 *
 * For example:
 * 1. Test A sets up fake timers
 * 2. Test B sets up fake timers around the same time
 * 3. Test A finishes and clears out all fake timers (for A and B)
 * 4. Test B runs and expects fake timers to be used, but they no longer exist
 *
 * Especially with there being so many test cases, the risk of flakes goes up a
 * lot.
 *
 * We could redefine TimeSync to accept setInterval and clearInterval callbacks
 * manually during instantiation, which would give us the needed test isolation
 * to avoid the vi mocks and enable concurrency. But then you'd have to do one
 * of two things:
 *
 * 1. Pollute the API with extra properties that are only ever relevant for
 *    internal testing
 * 2. Create two versions of TimeSync – an internal one used for core logic and
 *    testing, and a public wrapper that embeds setInterval and clearInterval,
 *    and then prevents them from being set afterwards.
 *
 * Those both feel a bit clunky, and not worth it. Especially with the scope of
 * the package being pretty small, and Vitest being pretty fast normally, we're
 * just going to use serial tests.
 */
describe(TimeSync.name, () => {
	describe("Subscriptions: default behavior", () => {
		it("Never auto-updates state while there are zero subscribers", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const initialSnap = sync.getStateSnapshot().dateSnapshot;
			expect(initialSnap).toEqual(initialDate);

			await vi.advanceTimersByTimeAsync(5 * refreshRates.oneSecond);
			const newSnap1 = sync.getStateSnapshot().dateSnapshot;
			expect(newSnap1).toEqual(initialSnap);

			await vi.advanceTimersByTimeAsync(500 * refreshRates.oneSecond);
			const newSnap2 = sync.getStateSnapshot().dateSnapshot;
			expect(newSnap2).toEqual(initialSnap);
		});

		it("Lets a single system subscribe to updates", async ({ expect }) => {
			const sampleLiveRefreshRates: readonly number[] = [
				refreshRates.oneSecond,
				refreshRates.oneMinute,
				refreshRates.oneHour,
			];
			for (const rate of sampleLiveRefreshRates) {
				// Duplicating all of these calls per iteration to maximize
				// test isolation
				const initialDate = initializeTime();
				const sync = new TimeSync({ initialDate });
				const onUpdate = vi.fn();

				void sync.subscribe({
					onUpdate,
					targetRefreshIntervalMs: rate,
				});
				expect(onUpdate).not.toHaveBeenCalled();

				const dateBefore = sync.getStateSnapshot().dateSnapshot;
				await vi.advanceTimersByTimeAsync(rate);
				const dateAfter = sync.getStateSnapshot().dateSnapshot;
				expect(onUpdate).toHaveBeenCalledTimes(1);
				expect(onUpdate).toHaveBeenCalledWith(dateAfter);

				const diff = dateAfter.getTime() - dateBefore.getTime();
				expect(diff).toBe(rate);
			}
		});

		it("Throws an error if provided subscription interval is not a positive integer", ({
			expect,
		}) => {
			const sync = new TimeSync();
			const dummyFunction = vi.fn();

			const intervals: readonly number[] = [
				Number.NaN,
				Number.NEGATIVE_INFINITY,
				0,
				-42,
				470.53,
			];
			for (const i of intervals) {
				expect(() => {
					void sync.subscribe({
						targetRefreshIntervalMs: i,
						onUpdate: dummyFunction,
					});
				}).toThrow(
					`Target refresh interval must be positive infinity or a positive integer (received ${i} ms)`,
				);
			}
		});

		it("Lets multiple subscribers subscribe to updates", ({ expect }) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const dummyOnUpdate = vi.fn();

			void sync.subscribe({
				targetRefreshIntervalMs: refreshRates.oneMinute,
				onUpdate: dummyOnUpdate,
			});
			void sync.subscribe({
				targetRefreshIntervalMs: refreshRates.oneMinute,
				onUpdate: dummyOnUpdate,
			});

			const snap = sync.getStateSnapshot();
			expect(snap.subscriberCount).toBe(2);
		});

		it("Dispatches the same date object (by reference) to all subscribers on update", async ({
			expect,
		}) => {
			const testCount = 10;
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			// We use .every later in the test, and it automatically skips over
			// elements that haven't been explicitly initialized with a value
			const dateTracker = new Array<Date | null>(testCount).fill(null);
			for (let i = 0; i < testCount; i++) {
				void sync.subscribe({
					targetRefreshIntervalMs: refreshRates.oneSecond,
					onUpdate: (date) => {
						dateTracker[i] = date;
					},
				});
			}

			await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
			expect(dateTracker[0]).not.toBeNull();
			const allMatch = dateTracker.every((d) => d === dateTracker[0]);
			expect(allMatch).toBe(true);
		});

		it("Dispatches updates to all subscribers based on fastest interval specified", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			const hourOnUpdate = vi.fn();
			void sync.subscribe({
				onUpdate: hourOnUpdate,
				targetRefreshIntervalMs: refreshRates.oneHour,
			});

			const minuteOnUpdate = vi.fn();
			void sync.subscribe({
				onUpdate: minuteOnUpdate,
				targetRefreshIntervalMs: refreshRates.oneMinute,
			});

			const secondOnUpdate = vi.fn();
			void sync.subscribe({
				onUpdate: secondOnUpdate,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
			expect(hourOnUpdate).toHaveBeenCalledTimes(1);
			expect(minuteOnUpdate).toHaveBeenCalledTimes(1);
			expect(secondOnUpdate).toHaveBeenCalledTimes(1);
		});

		it("Calls onUpdate callback one time total if callback is registered multiple times for the same time interval", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const sharedOnUpdate = vi.fn();

			for (let i = 1; i <= 3; i++) {
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneMinute,
				});
			}

			await vi.advanceTimersByTimeAsync(refreshRates.oneMinute);
			expect(sharedOnUpdate).toHaveBeenCalledTimes(1);
		});

		it("Calls onUpdate callback one time total if callback is registered multiple times for different time intervals", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const sharedOnUpdate = vi.fn();

			void sync.subscribe({
				onUpdate: sharedOnUpdate,
				targetRefreshIntervalMs: refreshRates.oneHour,
			});
			void sync.subscribe({
				onUpdate: sharedOnUpdate,
				targetRefreshIntervalMs: refreshRates.oneMinute,
			});
			void sync.subscribe({
				onUpdate: sharedOnUpdate,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			// Testing like this to ensure that for really, really long spans of
			// time, the no duplicated calls logic still holds up
			await vi.advanceTimersByTimeAsync(refreshRates.oneHour);
			const secondsInOneHour = 3600;
			expect(sharedOnUpdate).toHaveBeenCalledTimes(secondsInOneHour);
		});

		it("Calls onUpdate callback one time total if callback is registered multiple times with a mix of redundant/different intervals", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const sharedOnUpdate = vi.fn();

			for (let i = 0; i < 10; i++) {
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneHour,
				});
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneMinute,
				});
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneSecond,
				});
			}

			await vi.advanceTimersByTimeAsync(refreshRates.oneHour);
			const secondsInOneHour = 3600;
			expect(sharedOnUpdate).toHaveBeenCalledTimes(secondsInOneHour);
		});

		it("Lets an external system unsubscribe", async ({ expect }) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			const onUpdate = vi.fn();
			const unsub = sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			unsub();
			await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
			expect(onUpdate).not.toHaveBeenCalled();
		});

		it("Turns unsubscribe callback into no-op if called more than once", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			const onUpdate = vi.fn();
			const unsub = sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			// Also adding extra dummy subscription to make sure internal state
			// still works properly and isn't messed with from extra unsub calls
			void sync.subscribe({
				onUpdate: vi.fn(),
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});
			const initialSnap = sync.getStateSnapshot();
			expect(initialSnap.subscriberCount).toBe(2);

			for (let i = 0; i < 10; i++) {
				unsub();
				await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
				expect(onUpdate).not.toHaveBeenCalled();

				const newSnap = sync.getStateSnapshot();
				expect(newSnap.subscriberCount).toBe(1);
			}
		});

		it("Does not fully remove an onUpdate callback if multiple systems use it to subscribe, and only one system unsubscribes", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const sharedOnUpdate = vi.fn();

			for (let i = 0; i < 10; i++) {
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneHour,
				});
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneMinute,
				});
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneSecond,
				});
			}

			const extraOnUpdate = vi.fn();
			const extraUnsub = sync.subscribe({
				onUpdate: extraOnUpdate,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			const snap1 = sync.getStateSnapshot();
			expect(snap1.subscriberCount).toBe(31);

			extraUnsub();
			const snap2 = sync.getStateSnapshot();
			expect(snap2.subscriberCount).toBe(30);
			await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
			expect(sharedOnUpdate).toHaveBeenCalledTimes(1);
		});

		it("Slows updates down to the second-fastest interval when the all subscribers for the fastest interval unsubscribe", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			const onUpdate1 = vi.fn();
			const unsub1 = sync.subscribe({
				onUpdate: onUpdate1,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			const onUpdate2 = vi.fn();
			const unsub2 = sync.subscribe({
				onUpdate: onUpdate2,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			const onUpdate3 = vi.fn();
			void sync.subscribe({
				onUpdate: onUpdate3,
				targetRefreshIntervalMs: refreshRates.oneMinute,
			});

			await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
			expect(onUpdate1).toHaveBeenCalledTimes(1);
			expect(onUpdate2).toHaveBeenCalledTimes(1);
			expect(onUpdate3).toHaveBeenCalledTimes(1);

			unsub1();
			unsub2();
			await vi.advanceTimersByTimeAsync(refreshRates.oneSecond);
			expect(onUpdate1).toHaveBeenCalledTimes(1);
			expect(onUpdate2).toHaveBeenCalledTimes(1);
			expect(onUpdate3).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(
				refreshRates.oneMinute - refreshRates.oneSecond,
			);
			expect(onUpdate1).toHaveBeenCalledTimes(1);
			expect(onUpdate2).toHaveBeenCalledTimes(1);
			expect(onUpdate3).toHaveBeenCalledTimes(2);
		});

		/**
		 * Was really hard to describe this in a single sentence, but basically:
		 * 1. Let's say that we have subscribers A and B. A subscribes for 500ms
		 *    and B subscribes for 1000ms.
		 * 2. At 450ms, A unsubscribes.
		 * 3. Rather than starting the timer over, a one-time 'pseudo-timeout'
		 *    is kicked off for the delta between the elapsed time and B (550ms)
		 * 4. After the timeout resolves, updates go back to happening on an
		 *    interval of 1000ms.
		 *
		 * Because of unfortunate limitations with JavaScript's macrotask queue,
		 * there is a risk that there will be small delays introduced between
		 * starting and stopping intervals, but any attempts to minimize them
		 * (you can't completely remove them) might make the library a nightmare
		 * to maintain.
		 */
		it.only("Does not completely start next interval over from scratch if fastest subscription is removed halfway through update", async ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			const onUpdate1 = vi.fn();
			const unsub1 = sync.subscribe({
				onUpdate: onUpdate1,
				targetRefreshIntervalMs: refreshRates.halfSecond,
			});

			const onUpdate2 = vi.fn();
			void sync.subscribe({
				onUpdate: onUpdate2,
				targetRefreshIntervalMs: refreshRates.oneSecond,
			});

			await vi.advanceTimersByTimeAsync(450);
			unsub1();

			await vi.advanceTimersByTimeAsync(50);
			expect(onUpdate1).not.toHaveBeenCalled();
			expect(onUpdate2).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(500);
			expect(onUpdate1).not.toHaveBeenCalled();
			expect(onUpdate2).toHaveBeenCalledTimes(1);
		});

		it("Immediately notifies subscribers if new refresh interval is added that is less than or equal to the time since the last update", ({
			expect,
		}) => {
			expect.hasAssertions();
		});

		it("Automatically refreshes the date snapshot after the very first subscription is received, regardless of specified refresh interval", ({
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
				minimumRefreshIntervalMs: refreshRates.oneHour,
			});

			const onUpdate = vi.fn();
			void sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: refreshRates.oneMinute,
			});

			await vi.advanceTimersByTimeAsync(refreshRates.oneMinute);
			expect(onUpdate).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(refreshRates.oneHour);
			expect(onUpdate).toHaveBeenCalledTimes(1);
		});

		it("Throws if custom min interval is not a positive integer", ({
			expect,
		}) => {
			const intervals: readonly number[] = [
				Number.NaN,
				Number.NEGATIVE_INFINITY,
				0,
				-42,
				470.53,
			];
			for (const i of intervals) {
				expect(() => {
					void new TimeSync({ minimumRefreshIntervalMs: i });
				}).toThrow(
					`Minimum refresh interval must be a positive integer (received ${i} ms)`,
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
			expect(snap).toEqual<Snapshot>({
				dateSnapshot: initialDate,
				isDisposed: false,
				isFrozen: false,
				subscriberCount: 0,
				minimumRefreshIntervalMs: minimumRefreshIntervalMs,
			});
		});

		it("Reflects custom initial date if provided", ({ expect }) => {
			void initializeTime();
			const override = new Date("April 1, 1000");
			const sync = new TimeSync({ initialDate: override });

			const snap = sync.getStateSnapshot();
			expect(snap.dateSnapshot).toEqual(override);
		});

		it("Reflects the minimum refresh interval used on init", ({ expect }) => {
			const sync = new TimeSync({
				minimumRefreshIntervalMs: refreshRates.oneHour,
			});
			const snap = sync.getStateSnapshot();
			expect(snap.minimumRefreshIntervalMs).toBe(refreshRates.oneHour);
		});

		// This behavior is super, super important for the React bindings. The
		// bindings rely on useSyncExternalStore, which will pull from whatever
		// is bound to it multiple times in dev mode. That ensures that React
		// can fudge the rules and treat it like a pure value, but if it gets
		// back different references, it will keep pulling over and over until
		// it gives up, throws a rendering error, and blows up the entire app.
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
				targetRefreshIntervalMs: refreshRates.oneHour,
			});
			await vi.advanceTimersByTimeAsync(refreshRates.oneHour);

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

			await vi.advanceTimersByTimeAsync(refreshRates.oneHour);
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
					targetRefreshIntervalMs: refreshRates.oneHour,
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
				targetRefreshIntervalMs: refreshRates.oneHour,
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
			const snap = sync.getStateSnapshot() as Writeable<Snapshot>;
			const copyBeforeMutations = { ...snap };
			const mutationSource: Snapshot = {
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

		it("Defaults to staleness threshold of 0", async ({ expect }) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });
			const initialSnap = sync.getStateSnapshot();

			// Advance timers to guarantee that there will be some kind of
			// difference in the dates
			await vi.advanceTimersByTimeAsync(5000);
			sync.invalidateState({ notificationBehavior: "onChange" });
			const newSnap = sync.getStateSnapshot();
			expect(newSnap).not.toEqual(initialSnap);
		});

		it("Throws when provided a staleness threshold that is neither a positive integer nor zero", ({
			expect,
		}) => {
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			const intervals: readonly number[] = [
				Number.NaN,
				Number.NEGATIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				-42,
				470.53,
			];
			for (const i of intervals) {
				expect(() => {
					void sync.invalidateState({
						notificationBehavior: "onChange",
						stalenessThresholdMs: i,
					});
				}).toThrow(RangeError);
			}
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
				targetRefreshIntervalMs: refreshRates.oneHour,
			});

			await vi.advanceTimersByTimeAsync(refreshRates.oneMinute);
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
				targetRefreshIntervalMs: refreshRates.oneHour,
			});

			sync.invalidateState({ notificationBehavior: "always" });
			expect(onUpdate).toHaveBeenCalledTimes(1);

			const newSnap = sync.getStateSnapshot();
			expect(newSnap).not.toEqual(initialSnap);
			expect(newSnap.dateSnapshot).toEqual(ejectedDate);
		});
	});

	describe("Disposing of a TimeSync instance", () => {
		it("Clears active interval", async ({ expect }) => {
			const setSpy = vi.spyOn(globalThis, "setInterval");
			const clearSpy = vi.spyOn(globalThis, "clearInterval");
			const initialDate = initializeTime();
			const sync = new TimeSync({ initialDate });

			const onUpdate = vi.fn();
			void sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: refreshRates.oneMinute,
			});

			// We call clearInterval a lot in the library code to be on the
			// defensive side, and limit the risk of bugs creeping through.
			// Trying to tie the test to a specific number of calls felt like
			// tying it to implementation details too much. So, instead we're
			// going to assume that if the clear was called at least once, and
			// the number of set calls hasn't changed from before the disposal
			// step, we're good
			expect(setSpy).toHaveBeenCalledTimes(1);
			sync.dispose();
			expect(clearSpy).toHaveBeenCalled();
			expect(setSpy).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(refreshRates.oneMinute);
			expect(onUpdate).not.toHaveBeenCalled();
		});

		it("Automatically unsubscribes everything", async ({ expect }) => {
			const sync = new TimeSync();
			const sharedOnUpdate = vi.fn();

			for (let i = 0; i < 100; i++) {
				void sync.subscribe({
					onUpdate: sharedOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneMinute,
				});
			}

			const oldSnap = sync.getStateSnapshot();
			expect(oldSnap.subscriberCount).toBe(100);

			sync.dispose();
			const newSnap = sync.getStateSnapshot();
			expect(newSnap.isDisposed).toBe(true);
			expect(newSnap.subscriberCount).toBe(0);

			await vi.advanceTimersByTimeAsync(refreshRates.oneMinute);
			expect(sharedOnUpdate).not.toHaveBeenCalled();
		});

		it("Turns future subscriptions into no-ops", async ({ expect }) => {
			const sync = new TimeSync();
			sync.dispose();

			const onUpdate = vi.fn();
			const unsub = sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: refreshRates.oneMinute,
			});

			const snap1 = sync.getStateSnapshot();
			expect(snap1.subscriberCount).toBe(0);

			await vi.advanceTimersByTimeAsync(2 * refreshRates.oneMinute);
			expect(onUpdate).not.toHaveBeenCalled();

			// Doing unsub assertion just to be extra safe
			unsub();
			const snap2 = sync.getStateSnapshot();
			expect(snap2.subscriberCount).toBe(0);
		});
	});

	/**
	 * @todo 2025-11-17 - The intention with the frozen status is that once set
	 * on init, there should be no way to make it un-frozen – a consumer would
	 * need to create a fresh instance from scratch.
	 *
	 * Not sure how to codify that in tests yet, but ideally it should be.
	 */
	describe("Freezing updates on init", () => {
		it("Never updates internal state, no matter how many subscribers susbcribe", ({
			expect,
		}) => {
			const initialDate = new Date("August 25, 1832");
			const sync = new TimeSync({ initialDate, freezeUpdates: true });
			const dummyOnUpdate = vi.fn();

			for (let i = 0; i < 1000; i++) {
				void sync.subscribe({
					onUpdate: dummyOnUpdate,
					targetRefreshIntervalMs: refreshRates.oneMinute,
				});
			}

			const snap = sync.getStateSnapshot();
			expect(snap.subscriberCount).toBe(0);
			expect(snap.dateSnapshot).toEqual(initialDate);
		});

		it("Turns state invalidations into no-ops", ({ expect }) => {
			const sync = new TimeSync({ freezeUpdates: true });
			const onUpdate = vi.fn();
			void sync.subscribe({
				onUpdate,
				targetRefreshIntervalMs: refreshRates.oneMinute,
			});

			void sync.invalidateState({
				notificationBehavior: "always",
				stalenessThresholdMs: 0,
			});
			expect(onUpdate).not.toHaveBeenCalled();
		});
	});
});
