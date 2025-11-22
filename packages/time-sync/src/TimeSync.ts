import { ReadonlyDate } from "./ReadonlyDate";

/**
 * A collection of commonly-needed intervals (all defined in milliseconds).
 */
// Doing type assertion on the static numeric values to prevent compiler from
// over-inferring the types, and exposing too much info to end users
export const refreshRates = Object.freeze({
	/**
	 * Indicates that a subscriber does not strictly need updates, but is still
	 * allowed to be updated if it would keep it in sync with other subscribers.
	 *
	 * If all subscribers use this update interval, TimeSync will never dispatch
	 * any updates.
	 */
	idle: Number.POSITIVE_INFINITY,

	halfSecond: 500 as number,
	oneSecond: 1000 as number,
	thirtySeconds: 30_000 as number,
	oneMinute: 60 * 1000,
	fiveMinutes: 5 * 60 * 1000,
	oneHour: 60 * 60 * 1000,
}) satisfies Record<string, number>;

/**
 * The set of readonly options that the TimeSync has been configured with.
 */
export type ConfigurationOptions = Readonly<{
	/**
	 * Defaults to false. Indicates whether the TimeSync instance should be
	 * frozen for Snapshot tests. Highly encouraged that you use this together
	 * with `initialDate`.
	 */
	freezeUpdates: boolean;

	/**
	 * The minimum refresh interval (in milliseconds) to use when dispatching
	 * interval-based state updates. Defaults to 200ms.
	 *
	 * If a value smaller than this is specified when trying to set up a new
	 * subscription, this minimum will be used instead.
	 *
	 * It is highly recommended that you only modify this value if you have a
	 * good reason. Updating this value to be too low and make the event loop
	 * get really hot and really tank performance elsewhere in an application.
	 */
	minimumRefreshIntervalMs: number;

	/**
	 * Indicates whether the same `onUpdate` callback (by reference) should be
	 * called multiple time if registered by multiple systems.
	 *
	 * Defaults to false.
	 */
	allowDuplicateOnUpdateCalls: boolean;
}>;

/**
 * The set of options that can be used to instantiate a TimeSync.
 */
export type InitOptions = Readonly<
	ConfigurationOptions & {
		/**
		 * The Date object to use when initializing TimeSync to make the constructor
		 * more pure and deterministic.
		 */
		initialDate: Date;
	}
>;

/**
 * The callback to call when a new state update is ready to be dispatched.
 */
type OnTimeSyncUpdate = (snapshot: ReadonlyDate) => void;

export type SubscriptionHandshake = Readonly<{
	/**
	 * The maximum update interval that a subscriber needs. A value of
	 * Number.POSITIVE_INFINITY indicates that the subscriber does not strictly
	 * need any updates (though they may still happen based on other
	 * subscribers).
	 *
	 * TimeSync always dispatches updates based on the lowest update interval
	 * among all subscribers.
	 *
	 * For example, let's say that we have these three subscribers:
	 * 1. A - Needs updates no slower than 500ms
	 * 2. B – Needs updates no slower than 1000ms
	 * 3. C – Uses interval of Infinity (does not strictly need an update)
	 *
	 * A, B, and C will all be updated at a rate of 500ms. If A unsubscribes,
	 * then B and C will shift to being updated every 1000ms. If B unsubscribes
	 * after A, updates will pause completely until a new subscriber gets
	 * added, and it has a non-infinite interval.
	 */
	targetRefreshIntervalMs: number;

	/**
	 * The callback to call when a new state update needs to be flushed amongst
	 * all subscribers.
	 */
	onUpdate: OnTimeSyncUpdate;
}>;

const notificationBehaviors = [
	"onChange",
	"never",
	"always",
] as const satisfies readonly string[];

export type NotificationBehavior = (typeof notificationBehaviors)[number];

export type InvalidateStateOptions = Readonly<{
	/**
	 * The amount of time (in milliseconds) that you can tolerate stale dates.
	 * If the time since the last subscription dispatch and the current time
	 * does not exceed this value, the state will not be changed. Defaults to
	 * `0` if not specified (always invalidates the date snapshot).
	 *
	 * By definition, date state becomes stale the moment that it gets stored in
	 * a TimeSync instance (even if the execution context never changes, some
	 * time needs to elapse between the date being created, and it being
	 * stored). Specifying this value lets you protect against over-notifying
	 * subscribers if you can afford to rely on having the default subscription
	 * behavior handle the next dispatch.
	 */
	stalenessThresholdMs?: number;

	/**
	 * Lets you define how subscribers should be notified when an invalidation
	 * happens. Defaults to "onChange" if not specified.
	 *
	 * `onChange` - Only notify subscribers if the data snapshot changed.
	 * `never` - Never notify subscribers, regardless of any state changes.
	 * `always` - Notify subscribers, even if the date didn't change.
	 */
	notificationBehavior?: NotificationBehavior;
}>;

/**
 * A complete snapshot of the user-relevant internal state from TimeSync. This
 * value is treated as immutable at both runtime and compile time.
 */
export type Snapshot = Readonly<{
	date: ReadonlyDate;
	subscriberCount: number;
	isDisposed: boolean;
	config: ConfigurationOptions;
}>;

interface TimeSyncApi {
	/**
	 * Subscribes an external system to TimeSync.
	 *
	 * The same callback (by reference) is allowed to be registered multiple
	 * times, either for the same update interval, or different update
	 * intervals. Depending on how TimeSync is instantiated, it may choose to
	 * de-duplicate these function calls on each round of updates.
	 *
	 * @throws {RangeError} If the provided interval is not either a positive
	 * integer or positive infinity.
	 * @returns An unsubscribe callback. Calling the callback more than once
	 * results in a no-op.
	 */
	subscribe: (handshake: SubscriptionHandshake) => () => void;

	/**
	 * Allows an external system to pull an immutable snapshot of some of the
	 * internal state inside TimeSync. The snapshot is frozen at runtime and
	 * cannot be mutated.
	 *
	 * @returns An object with multiple properties describing the TimeSync.
	 */
	getStateSnapshot: () => Snapshot;

	/**
	 * Immediately tries to refresh TimeSync's internal state snapshot with
	 * fresh data like the latest date.
	 *
	 * @throws {RangeError} If the provided interval for the
	 * `stalenessThresholdMs` property is neither a positive integer nor
	 * positive infinity.
	 * @returns The latest date state snapshot right after invalidation. Note
	 * that this snapshot might be the same as before.
	 */
	invalidateState: (options: InvalidateStateOptions) => Snapshot;

	/**
	 * Cleans up the TimeSync instance and renders it inert for all other
	 * operations.
	 */
	dispose: () => void;
}

type SubscriptionEntry = Readonly<{
	targetInterval: number;
	unsubscribe: () => void;
}>;

type UpdateDateResult = Readonly<{
	wasChanged: boolean;
	dateBeforeUpdate: ReadonlyDate;
}>;

/* biome-ignore lint:suspicious/noEmptyBlockStatements -- Need this function to
   have no logic at runtime. It needs to be empty – by design. */
function noOp(..._: readonly unknown[]): void {}

const defaultMinimumRefreshIntervalMs = 200;

/**
 * One thing that was considered was giving TimeSync the ability to flip which
 * kinds of dates it uses, and let it use native dates instead of readonly
 * dates. We type readonly dates as native dates for better interoperability
 * with pretty much every JavaScript library under the sun, but there is still a
 * big difference in runtime behavior. There is a risk that blocking mutations
 * could break some other library in other ways.
 *
 * That might be worth revisiting if we get user feedback, but right now, it
 * seems like an incredibly bad idea.
 *
 * 1. Any single mutation has a risk of breaking the entire integrity of the
 *    system. If a consumer would try to mutate them, things SHOULD blow up by
 *    default.
 * 2. Dates are a type of object that are far more read-heavy than write-heavy,
 *    so the risks of breaking are generally lower
 * 3. If a user really needs a mutable version of the date, they can make a
 *    mutable copy first via `const copy = new Date(readonlyDate)`
 *
 * The one case when turning off the readonly behavior would be good would be
 * if you're on a server that really needs to watch its garbage collection
 * output, and you the overhead from the readonly date's proxy is causing too
 * much pressure on resources. In that case, you could switch to native dates,
 * but you'd still need a LOT of trigger discipline to avoid mutations.
 */
/**
 * TimeSync provides a centralized authority for working with time values in a
 * more structured way, where all dependents for the time values must stay in
 * sync with each other.
 *
 * (e.g., In a React codebase, you want multiple components that rely on time
 * values to update together, to avoid screen tearing and stale data for only
 * some parts of the screen.)
 */
export class TimeSync implements TimeSyncApi {
	#latestSnapshot: Snapshot;

	/**
	 * Indicates when the last successful state update dispatch was. Can be used
	 * to track whether there has been a de-sync from invalidating the state.
	 *
	 * Once this value has transitioned from null to a date, there should be no
	 * way for it to transition back to null.
	 */
	#lastDispatchDate: ReadonlyDate | null;

	/**
	 * Stores all refresh intervals actively associated with an onUpdate
	 * callback (along with their associated unsubscribe callbacks).
	 *
	 * Supports storing the exact same callback-interval pairs multiple times,
	 * in case multiple external systems need to subscribe with the exact same
	 * data concerns. Because the functions themselves are used as keys, that
	 * ensures that each callback will only be called once per update, no matter
	 * how subscribers use it.
	 *
	 * Each map value should stay sorted by refresh interval, in ascending
	 * order.
	 */
	#subscriptions: Map<OnTimeSyncUpdate, SubscriptionEntry[]>;

	/**
	 * A cached version of the fastest interval currently registered with
	 * TimeSync. Should always be derived from #subscriptions
	 */
	#fastestRefreshInterval: number;

	/**
	 * Used for both its intended purpose (creating interval), but also as a
	 * janky version of setTimeout.
	 *
	 * There are a few times when we need timeout-like logic, but if we use
	 * setInterval for everything, we have fewer IDs to juggle, and less risk of
	 * things getting out of sync.
	 *
	 * Type defined like this to support client and server behavior.
	 */
	#intervalId: NodeJS.Timeout | number | undefined;

	constructor(options?: Partial<InitOptions>) {
		const {
			initialDate,
			freezeUpdates = false,
			allowDuplicateOnUpdateCalls = false,
			minimumRefreshIntervalMs = defaultMinimumRefreshIntervalMs,
		} = options ?? {};

		const isMinValid =
			Number.isInteger(minimumRefreshIntervalMs) &&
			minimumRefreshIntervalMs > 0;
		if (!isMinValid) {
			throw new RangeError(
				`Minimum refresh interval must be a positive integer (received ${minimumRefreshIntervalMs} ms)`,
			);
		}

		this.#subscriptions = new Map();
		this.#fastestRefreshInterval = Number.POSITIVE_INFINITY;
		this.#intervalId = undefined;
		this.#lastDispatchDate = null;

		this.#latestSnapshot = Object.freeze({
			subscriberCount: 0,
			isDisposed: false,
			date: initialDate ? new ReadonlyDate(initialDate) : new ReadonlyDate(),
			config: Object.freeze({
				freezeUpdates,
				minimumRefreshIntervalMs,
				allowDuplicateOnUpdateCalls,
			}),
		});
	}

	#notifyAllSubscriptions(): void {
		// It's more important that we copy the date object into a separate
		// variable here than normal, because need make sure the `this` context
		// can't magically change between updates and cause subscribers to
		// receive different values (e.g., one of the subscribers calls the
		// invalidate method)
		const { isDisposed, date, config } = this.#latestSnapshot;

		// We still need to let the logic go through if the current fastest
		// interval is Infinity, so that we can support letting any arbitrary
		// consumer invalidate the date immediately
		const subscriptionsPaused =
			isDisposed || config.freezeUpdates || this.#subscriptions.size === 0;
		if (subscriptionsPaused) {
			return;
		}

		// While this is a super niche use case, we're actually safe if a
		// subscriber disposes of the whole TimeSync instance. Once the Map is
		// cleared, the map's iterator will automatically break the loop. So
		// there's no risk of continuing to dispatch values after cleanup.
		if (config.allowDuplicateOnUpdateCalls) {
			for (const [onUpdate, subs] of this.#subscriptions) {
				for (const _ of subs) {
					onUpdate(date);
				}
			}
		} else {
			for (const onUpdate of this.#subscriptions.keys()) {
				onUpdate(date);
			}
		}

		this.#lastDispatchDate = date;
	}

	/**
	 * The logic that should happen at each step in TimeSync's active interval.
	 *
	 * Defined as an arrow function so that we can just pass it directly to
	 * setInterval without needing to make a new wrapper function each time. We
	 * don't have many situations where we can lose the `this` context, but this
	 * is one of them.
	 */
	#onTick = (): void => {
		const { isDisposed, config } = this.#latestSnapshot;
		if (isDisposed || config.freezeUpdates) {
			// Defensive step to make sure that an invalid tick wasn't started
			clearInterval(this.#intervalId);
			this.#intervalId = undefined;
			return;
		}

		const { wasChanged } = this.#updateDate();
		const timeSinceLastBroadcast =
			this.#lastDispatchDate === null
				? Number.POSITIVE_INFINITY
				: this.#latestSnapshot.date.getTime() -
					this.#lastDispatchDate.getTime();

		const hasPendingBroadcast = timeSinceLastBroadcast !== 0;
		if (wasChanged || hasPendingBroadcast) {
			this.#notifyAllSubscriptions();
		}
	};

	#onFastestIntervalChange(): void {
		const fastest = this.#fastestRefreshInterval;
		const { isDisposed, date, config } = this.#latestSnapshot;
		const updatesShouldStop =
			isDisposed ||
			config.freezeUpdates ||
			fastest === Number.POSITIVE_INFINITY;
		if (updatesShouldStop) {
			clearInterval(this.#intervalId);
			this.#intervalId = undefined;
			return;
		}

		const elapsed = new ReadonlyDate().getTime() - date.getTime();
		const timeBeforeNextUpdate = fastest - elapsed;

		// Clear previous interval sight unseen just to be on the safe side
		clearInterval(this.#intervalId);

		if (timeBeforeNextUpdate <= 0) {
			const { wasChanged } = this.#updateDate();
			if (wasChanged) {
				this.#notifyAllSubscriptions();
			}
			this.#intervalId = setInterval(this.#onTick, fastest);
			return;
		}

		// Most common case for this branch is the very first subscription
		// getting added, but there's still the small chance that the fastest
		// interval could change right after an update got flushed
		if (timeBeforeNextUpdate === fastest) {
			this.#intervalId = setInterval(this.#onTick, timeBeforeNextUpdate);
			return;
		}

		// Otherwise, use interval as pseudo-timeout, and then go back to using
		// it as a normal interval afterwards
		this.#intervalId = setInterval(() => {
			clearInterval(this.#intervalId);

			// Need to set up interval before ticking in the tiny, tiny chance
			// that ticking would cause the TimeSync instance to be disposed. We
			// don't want to start a new interval right after we've lost our
			// ability to do cleanup. The timer won't starting getting processed
			// until the function leaves scope anyway
			this.#intervalId = setInterval(this.#onTick, fastest);
			this.#onTick();
		}, timeBeforeNextUpdate);
	}

	#updateFastestInterval(): void {
		const { isDisposed, config } = this.#latestSnapshot;
		if (isDisposed || config.freezeUpdates) {
			this.#fastestRefreshInterval = Number.POSITIVE_INFINITY;
			return;
		}

		const prevFastest = this.#fastestRefreshInterval;
		let newFastest = Number.POSITIVE_INFINITY;

		// This setup requires that every interval array stay sorted. It
		// immediately falls apart if this isn't guaranteed.
		for (const entries of this.#subscriptions.values()) {
			const subFastest = entries[0]?.targetInterval ?? Number.POSITIVE_INFINITY;
			if (subFastest < newFastest) {
				newFastest = subFastest;
			}
		}

		this.#fastestRefreshInterval = newFastest;
		if (prevFastest !== newFastest) {
			this.#onFastestIntervalChange();
		}
	}

	/**
	 * Attempts to update the current Date snapshot.
	 */
	#updateDate(): UpdateDateResult {
		const { isDisposed, config, date: dateBeforeUpdate } = this.#latestSnapshot;
		if (isDisposed || config.freezeUpdates) {
			return { dateBeforeUpdate, wasChanged: false };
		}

		this.#latestSnapshot = Object.freeze({
			...this.#latestSnapshot,
			date: new ReadonlyDate(),
		});

		return { dateBeforeUpdate, wasChanged: true };
	}

	subscribe(sh: SubscriptionHandshake): () => void {
		const { isDisposed, config } = this.#latestSnapshot;
		if (isDisposed || config.freezeUpdates) {
			return noOp;
		}

		// Destructuring properties so that they can't be fiddled with after
		// this function call ends
		const { targetRefreshIntervalMs, onUpdate } = sh;

		const isTargetValid =
			targetRefreshIntervalMs === Number.POSITIVE_INFINITY ||
			(Number.isInteger(targetRefreshIntervalMs) &&
				targetRefreshIntervalMs > 0);
		if (!isTargetValid) {
			throw new Error(
				`Target refresh interval must be positive infinity or a positive integer (received ${targetRefreshIntervalMs} ms)`,
			);
		}

		let unsubscribed = false;
		const unsubscribe = (): void => {
			if (unsubscribed) {
				return;
			}

			const entries = this.#subscriptions.get(onUpdate);
			if (entries === undefined) {
				return;
			}
			const matchIndex = entries.findIndex(
				(e) => e.unsubscribe === unsubscribe,
			);
			if (matchIndex === -1) {
				return;
			}
			// No need to sort on removal because everything gets sorted as it
			// enters the subscriptions map
			entries.splice(matchIndex, 1);
			if (entries.length === 0) {
				this.#subscriptions.delete(onUpdate);
			}
			this.#updateFastestInterval();

			this.#latestSnapshot = Object.freeze({
				...this.#latestSnapshot,
				subscriberCount: Math.max(0, this.#latestSnapshot.subscriberCount - 1),
			});
			unsubscribed = true;
		};

		let entries = this.#subscriptions.get(onUpdate);
		if (entries === undefined) {
			entries = [];
			this.#subscriptions.set(onUpdate, entries);
		}

		const targetInterval = Math.max(
			config.minimumRefreshIntervalMs,
			targetRefreshIntervalMs,
		);
		entries.push({ unsubscribe, targetInterval });
		entries.sort((e1, e2) => e1.targetInterval - e2.targetInterval);
		this.#latestSnapshot = Object.freeze({
			...this.#latestSnapshot,
			subscriberCount: this.#latestSnapshot.subscriberCount + 1,
		});

		const fastestBefore = this.#fastestRefreshInterval;
		this.#updateFastestInterval();

		/**
		 * To keep TimeSync easier to reason about, we don't kick off any
		 * intervals until you start using it – the constructor does not have
		 * any side effects aside from input validation.
		 *
		 * But we still need to handle two things, since we don't have a way of
		 * tracking them otherwise right now:
		 *
		 * 1. We don't know how much time will have elapsed between the class
		 *    being instantiated, and the first subscriber being added
		 * 2. We don't know how much time will have elapsed between an active
		 *    subscriber getting added and when the last subscription got added,
		 *    if all the previous subscribers are idle.
		 *
		 * Just updating the snapshot to be on the safe side.
		 */
		const shouldUpdateDate =
			this.#latestSnapshot.subscriberCount === 1 ||
			(fastestBefore === Number.POSITIVE_INFINITY &&
				this.#fastestRefreshInterval !== fastestBefore);
		if (shouldUpdateDate) {
			this.#updateDate();
		}

		return unsubscribe;
	}

	getStateSnapshot(): Snapshot {
		return this.#latestSnapshot;
	}

	invalidateState(options?: InvalidateStateOptions): Snapshot {
		const { stalenessThresholdMs = 0, notificationBehavior = "onChange" } =
			options ?? {};

		const isStaleValid =
			Number.isInteger(stalenessThresholdMs) && stalenessThresholdMs >= 0;
		if (!isStaleValid) {
			throw new RangeError(
				`Minimum refresh interval must be a positive integer (received ${stalenessThresholdMs} ms)`,
			);
		}
		if (!notificationBehaviors.includes(notificationBehavior)) {
			throw new RangeError(
				`Received notification behavior of "${notificationBehavior}", which is not supported`,
			);
		}

		const { isDisposed, config } = this.#latestSnapshot;
		if (isDisposed || config.freezeUpdates) {
			return this.#latestSnapshot;
		}

		const { wasChanged, dateBeforeUpdate } = this.#updateDate();
		switch (notificationBehavior) {
			case "never": {
				break;
			}
			case "always": {
				this.#notifyAllSubscriptions();
				break;
			}
			case "onChange": {
				const meetsThreshold =
					this.#latestSnapshot.date.getTime() - dateBeforeUpdate.getTime() >=
					stalenessThresholdMs;
				if (wasChanged && meetsThreshold) {
					this.#notifyAllSubscriptions();
				}
				break;
			}
		}

		return this.#latestSnapshot;
	}

	dispose(): void {
		const { isDisposed } = this.#latestSnapshot;
		if (isDisposed) {
			return;
		}

		this.#fastestRefreshInterval = 0;
		clearInterval(this.#intervalId);
		this.#intervalId = undefined;

		for (const entries of this.#subscriptions.values()) {
			for (const e of entries) {
				e.unsubscribe();
			}
		}
		this.#subscriptions.clear();

		this.#latestSnapshot = Object.freeze({
			...this.#latestSnapshot,
			subscriberCount: 0,
			isDisposed: true,
		});
	}
}
