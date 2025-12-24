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
export interface Configuration {
	/**
	 * Indicates whether the TimeSync instance should be frozen for Snapshot
	 * tests. Highly encouraged that you use this together with
	 * `initialDate`.
	 *
	 * Defaults to false.
	 */
	readonly freezeUpdates: boolean;

	/**
	 * The minimum refresh interval (in milliseconds) to use when dispatching
	 * interval-based state updates.
	 *
	 * If a value smaller than this is specified when trying to set up a new
	 * subscription, this minimum will be used instead.
	 *
	 * It is highly recommended that you only modify this value if you have a
	 * good reason. Updating this value to be too low can make the event loop
	 * get really hot and really tank performance elsewhere in an application.
	 *
	 * Defaults to 200ms.
	 */
	readonly minimumRefreshIntervalMs: number;

	/**
	 * Indicates whether the same `onUpdate` callback (by reference) should be
	 * called multiple time if registered by multiple systems.
	 *
	 * If this value is flipped to false, each onUpdate callback will receive
	 * the subscription context for the FIRST subscriber that registered the
	 * onUpdate callback.
	 *
	 * Defaults to true.
	 */
	readonly allowDuplicateOnUpdateCalls: boolean;
}

/**
 * The set of options that can be used to instantiate a TimeSync.
 */
export interface InitOptions extends Configuration {
	/**
	 * The Date object to use when initializing TimeSync to make the
	 * constructor more pure and deterministic.
	 */
	readonly initialDate: Date;
}

/**
 * An object used to initialize a new subscription for TimeSync.
 */
export interface SubscriptionInitOptions {
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
	readonly targetRefreshIntervalMs: number;

	/**
	 * The callback to call when a new state update needs to be flushed amongst
	 * all subscribers.
	 */
	readonly onUpdate: OnTimeSyncUpdate;
}

/**
 * A complete snapshot of the user-relevant internal state from TimeSync. This
 * value is treated as immutable at both runtime and compile time.
 */
export interface Snapshot {
	/**
	 * The date that TimeSync last processed. This will always match the date that
	 * was last dispatched to all subscribers, but if no updates have been issued,
	 * this value will match the date used to instantiate the TimeSync.
	 */
	readonly date: ReadonlyDate;

	/**
	 * The monotonic milliseconds that elapsed between the TimeSync being
	 * instantiated and the last update being dispatched.
	 *
	 * Will be null if no updates have ever been dispatched.
	 */
	readonly lastUpdatedAtMs: number | null;

	/**
	 * The number of subscribers registered with TimeSync.
	 */
	readonly subscriberCount: number;

	/**
	 * The configuration options used when instantiating the TimeSync instance.
	 * The value is guaranteed to be stable for the entire lifetime of TimeSync.
	 */
	readonly config: Configuration;
}

/**
 * An object with information about a specific subscription registered with
 * TimeSync. The entire context is frozen at runtime.
 */
export interface SubscriptionContext {
	/**
	 * A reference to the TimeSync instance that the subscription was registered
	 * with.
	 */
	readonly timeSync: TimeSync;

	/**
	 * The effective interval that the subscription is updating at. This may be a
	 * value larger than than the target refresh interval, depending on whether
	 * TimeSync was configured with a minimum refresh value.
	 */
	readonly refreshIntervalMs: number;

	/**
	 * The unsubscribe callback associated with a subscription. This is the same
	 * callback returned by `TimeSync.subscribe`.
	 */
	readonly unsubscribe: () => void;

	/**
	 * The monotonic milliseconds that elapsed between the TimeSync being
	 * instantiated and the subscription being registered.
	 */
	readonly registeredAtMs: number;
}

/**
 * The callback to call when a new state update is ready to be dispatched.
 */
export type OnTimeSyncUpdate = (
	newDate: ReadonlyDate,
	context: SubscriptionContext,
) => void;

interface TimeSyncApi {
	/**
	 * Subscribes an external system to TimeSync.
	 *
	 * The same callback (by reference) is allowed to be registered multiple
	 * times, either for the same update interval, or different update
	 * intervals. Depending on how TimeSync is instantiated, it may choose to
	 * de-duplicate these function calls on each round of updates.
	 *
	 * If a value of Number.POSITIVE_INFINITY is used, the subscription will be
	 * considered "idle". Idle subscriptions cannot trigger updates on their
	 * own, but can stay in the loop as otherupdates get dispatched from via
	 * other subscriptions.
	 *
	 * Consider using the refreshRates object from this package for a set of
	 * commonly-used intervals.
	 *
	 * @throws {RangeError} If the provided interval is neither a positive
	 * integer nor positive infinity.
	 * @returns An unsubscribe callback. Calling the callback more than once
	 * results in a no-op.
	 */
	subscribe: (options: SubscriptionInitOptions) => () => void;

	/**
	 * Allows an external system to pull an immutable snapshot of some of the
	 * internal state inside TimeSync. The snapshot is frozen at runtime and
	 * cannot be mutated.
	 *
	 * @returns An object with multiple properties describing the TimeSync.
	 */
	getStateSnapshot: () => Snapshot;

	/**
	 * Resets all internal state in the TimeSync, and handles all cleanup for
	 * subscriptions and intervals previously set up. Configuration values are
	 * retained.
	 *
	 * This method can be used as a dispose method for a locally-scoped
	 * TimeSync (a TimeSync with no subscribers is safe to garbage-collect
	 * without any risks of memory leaks). It can also be used to reset a global
	 * TimeSync to its initial state for certain testing setups.
	 */
	clearAll: () => void;
}

/*
 * Even though both the browser and the server are able to give monotonic times
 * that are at least as precise as a nanosecond, we're using milliseconds for
 * consistency with useInterval, which cannot be more precise than a
 * millisecond.
 */
function getMonotonicTimeMs(): number {
	// If we're on the server, we can use process.hrtime, which is defined for
	// Node, Deno, and Bun
	if (typeof window === "undefined") {
		const timeInNanoseconds = process.hrtime.bigint();
		return Number(timeInNanoseconds / 1000n);
	}

	// Otherwise, we need to get the high-resolution timestamp from the browser.
	// This value is fractional and goes to nine decimal places
	const highResTimestamp = window.performance.now();
	return Math.floor(highResTimestamp);
}

/*
 * This function is just a convenience for us to sidestep some problems around
 * TypeScript's LSP and Object.freeze. Because Object.freeze can accept any
 * arbitrary type, it basically acts as a "type boundary" between the left and
 * right sides of any snapshot assignments.
 *
 * That means that if you rename a property a a value that is passed to
 * Object.freeze, the LSP can't auto-rename it, and you potentially get missing
 * properties. This is a bit hokey, but because the function is defined strictly
 * in terms of concrete snapshots, any value passed to this function won't have
 * to worry about mismatches.
 */
function freezeSnapshot(snap: Snapshot): Snapshot {
	if (!Object.isFrozen(snap.config)) {
		Object.freeze(snap.config);
	}
	if (!Object.isFrozen(snap)) {
		Object.freeze(snap);
	}
	return snap;
}

/*
 * This function assumes that new subscription contexts will always be inserted
 * one at a time, and that all contexts previously in the array were already
 * fully sorted.
 *
 * Great use case for a single-pass insertion sort, and it means that we don't
 * have to go through the .sort API. That always uses some variation of merge
 * sort (so it would create a bunch of extra memory), and it has no guarantees
 * about the overall sorting of the whole array, and it requires that you create
 * a callback to handle the sorting. This is so much cheaper overall.
 *
 * To be clear, this is 100% overkill on client devices, but on servers, every
 * allocation you skip (especially with JavaScript/V8 being so memory-hungry)
 * can help a lot.
 */
function insertContext(
	ctxs: SubscriptionContext[],
	newC: SubscriptionContext,
): SubscriptionContext[] {
	ctxs.push(newC);

	for (let i = ctxs.length - 1; i > 0; i--) {
		const c1 = ctxs[i - 1];
		const c2 = ctxs[i];
		if (c1 === undefined || c2 === undefined) {
			throw new Error(`Went out of bounds when inserting for index ${i}`);
		}

		if (c1.refreshIntervalMs <= c2.refreshIntervalMs) {
			break;
		}

		ctxs[i - 1] = c2;
		ctxs[i] = c1;
	}

	return ctxs;
}

const defaultMinimumRefreshIntervalMs = 200;

/*
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
 *    mutable copy first via `const mutable = readonlyDate.toNativeDate()`
 *
 * The one case when turning off the readonly behavior would be good would be
 * if you're on a server that really needs to watch its garbage collection
 * output, and you the overhead from the readonly date is causing too much
 * pressure on resources. In that case, you could switch to native dates, but
 * you'd still need a LOT of trigger discipline to avoid mutations, especially
 * if you rely on outside libraries.
 */
/**
 * TimeSync provides a centralized authority for working with time values in a
 * more structured way. It ensures all dependents for the time values stay in
 * sync with each other.
 *
 * (e.g., In a React codebase, you want multiple components that rely on time
 * values to update together, to avoid screen tearing and stale data for only
 * some parts of the screen.)
 */
export class TimeSync implements TimeSyncApi {
	/*
	 * The monotonic time in milliseconds from when the TimeSync instance was
	 * first instantiated.
	 */
	readonly #initializedAtMs: number;

	/*
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
	 *
	 * ---
	 *
	 * This is a rare case where we actually REALLY need the readonly modifier
	 * to avoid infinite loops. JavaScript's iterator protocol is really great
	 * for making loops simple and type-safe, but because subscriptions have the
	 * ability to add more subscriptions, we need to make an immutable version
	 * of each array at some point to make sure that we're not iterating through
	 * values forever
	 *
	 * We can choose to do that at one of two points:
	 * 1. When adding a new subscription
	 * 2. When dispatching a new round of updates
	 *
	 * Because this library assumes that dispatches will be much more common
	 * than new subscriptions (a single subscription that subscribes for one
	 * second will receive 360 updates in five minutes), operations should be
	 * done to optimize that use case. So we should move the immutability costs
	 * to the subscribe and unsubscribe operations.
	 */
	#subscriptions: Map<OnTimeSyncUpdate, readonly SubscriptionContext[]>;

	/*
	 * The latest public snapshot of TimeSync's internal state. The snapshot
	 * should always be treated as an immutable value.
	 */
	#latestSnapshot: Snapshot;

	/*
	 * A cached version of the fastest interval currently registered with
	 * TimeSync. Should always be derived from #subscriptions
	 */
	#fastestRefreshInterval: number;

	/*
	 * Used for both its intended purpose (creating interval), but also as a
	 * janky version of setTimeout. Also, all versions of setInterval are
	 * monotonic, so we don't have to do anything special for it.
	 *
	 * There are a few times when we need timeout-like logic, but if we use
	 * setInterval for everything, we have fewer IDs to juggle, and less risk of
	 * things getting out of sync.
	 *
	 * Type defined like this to support client and server behavior. Node.js
	 * uses its own custom timeout type, but Deno, Bun, and the browser all use
	 * the number type.
	 */
	#intervalId: NodeJS.Timeout | number | undefined;

	constructor(options?: Partial<InitOptions>) {
		const {
			initialDate,
			freezeUpdates = false,
			allowDuplicateOnUpdateCalls = true,
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
		this.#initializedAtMs = getMonotonicTimeMs();

		let date: ReadonlyDate;
		if (initialDate instanceof ReadonlyDate) {
			date = initialDate;
		} else if (initialDate instanceof Date) {
			date = new ReadonlyDate(initialDate);
		} else {
			date = new ReadonlyDate();
		}

		this.#latestSnapshot = freezeSnapshot({
			date,
			subscriberCount: 0,
			lastUpdatedAtMs: null,
			config: {
				freezeUpdates,
				minimumRefreshIntervalMs,
				allowDuplicateOnUpdateCalls,
			},
		});
	}

	#notifyAllSubscriptions(): void {
		// It's more important that we copy the date object into a separate
		// variable here than normal, because need make sure the `this` context
		// can't magically change between updates and cause subscribers to
		// receive different values
		const { date, config } = this.#latestSnapshot;

		const subscriptionsPaused =
			config.freezeUpdates ||
			this.#subscriptions.size === 0 ||
			this.#fastestRefreshInterval === Number.POSITIVE_INFINITY;
		if (subscriptionsPaused) {
			return;
		}

		/*
		 * Two things:
		 * 1. Even though the context arrays are defined as readonly (which
		 * removes on the worst edge cases during dispatching), the
		 * subscriptions map itself is still mutable, so there are a few edge
		 * cases we need to deal with. While the risk of infinite loops should
		 * be much lower, there's still the risk that an onUpdate callback could
		 * add a subscriber for an interval that wasn't registered before, which
		 * the iterator protocol will pick up. Need to make a local,
		 * fixed-length copy of the map entries before starting iteration. Any
		 * subscriptions added during update will just have to wait until the
		 * next round of updates.
		 *
		 * 2. The trade off of the serialization is that we do lose the ability
		 * to auto-break the loop if one of the subscribers ends up resetting
		 * all state, because we'll still have local copies of entries. We need
		 * to check on each iteration to see if we should continue.
		 */
		const subsBeforeUpdate = this.#subscriptions;
		const localEntries = Array.from(subsBeforeUpdate);
		outer: for (const [onUpdate, subs] of localEntries) {
			for (const ctx of subs) {
				// We're not doing anything more sophisticated here because
				// we're assuming that any systems that can clear out the
				// subscriptions will handle cleaning up each context, too
				const wasClearedBetweenUpdates = subsBeforeUpdate.size === 0;
				if (wasClearedBetweenUpdates) {
					break outer;
				}

				onUpdate(date, ctx);
				if (!config.allowDuplicateOnUpdateCalls) {
					continue outer;
				}
			}
		}
	}

	/*
	 * The logic that should happen at each step in TimeSync's active interval.
	 *
	 * Defined as an arrow function so that we can just pass it directly to
	 * setInterval without needing to make a new wrapper function each time. We
	 * don't have many situations where we can lose the `this` context, but this
	 * is one of them.
	 */
	readonly #onTick = (): void => {
		const { config } = this.#latestSnapshot;
		if (config.freezeUpdates) {
			// Defensive step to make sure that an invalid tick wasn't started
			clearInterval(this.#intervalId);
			this.#intervalId = undefined;
			return;
		}

		// onTick is expected to be called in response to monotonic time changes
		// (either from calculating them manually to decide when to call onTick
		// synchronously or from letting setInterval handle the calls). So while
		// this edge case should basically be impossible, we need to make sure that
		// we always dispatch a date, even if its time is exactly the same.
		this.#latestSnapshot = freezeSnapshot({
			...this.#latestSnapshot,
			date: new ReadonlyDate(),
			lastUpdatedAtMs: getMonotonicTimeMs() - this.#initializedAtMs,
		});
		this.#notifyAllSubscriptions();
	};

	readonly #resolvePseudoTimeout = (): void => {
		clearInterval(this.#intervalId);

		// Need to set up interval before ticking in the tiny, tiny chance
		// that ticking would cause the TimeSync instance to be reset. We
		// don't want to start a new interval right after we've lost our
		// ability to do cleanup. The timer won't start getting processed
		// until this method leaves scope anyway
		this.#intervalId = setInterval(this.#onTick, this.#fastestRefreshInterval);
		this.#onTick();
	};

	#onFastestIntervalChange(): void {
		const fastest = this.#fastestRefreshInterval;
		const { lastUpdatedAtMs, config } = this.#latestSnapshot;

		const updatesShouldStop =
			config.freezeUpdates ||
			this.#subscriptions.size === 0 ||
			fastest === Number.POSITIVE_INFINITY;
		if (updatesShouldStop) {
			clearInterval(this.#intervalId);
			this.#intervalId = undefined;
			return;
		}

		const newTime = getMonotonicTimeMs();
		const elapsed = newTime - (lastUpdatedAtMs ?? this.#initializedAtMs);
		const timeBeforeNextUpdate = fastest - elapsed;

		// Clear previous interval no matter what just to be on the safe side
		clearInterval(this.#intervalId);

		if (timeBeforeNextUpdate <= 0) {
			this.#onTick();
			this.#intervalId = setInterval(this.#onTick, fastest);
			return;
		}

		// Most common case for this branch is the very first subscription
		// getting added, but there's still the small chance that the fastest
		// interval could change right after an update got flushed, so there would
		// be zero elapsed time to worry about
		if (timeBeforeNextUpdate === fastest) {
			this.#intervalId = setInterval(this.#onTick, timeBeforeNextUpdate);
			return;
		}

		this.#intervalId = setInterval(
			this.#resolvePseudoTimeout,
			timeBeforeNextUpdate,
		);
	}

	#updateFastestInterval(): void {
		const { config } = this.#latestSnapshot;
		if (config.freezeUpdates) {
			this.#fastestRefreshInterval = Number.POSITIVE_INFINITY;
			return;
		}

		// This setup requires that every interval array stay sorted. It
		// immediately falls apart if this isn't guaranteed.
		const prevFastest = this.#fastestRefreshInterval;
		let newFastest = Number.POSITIVE_INFINITY;
		for (const contexts of this.#subscriptions.values()) {
			const subFastest =
				contexts[0]?.refreshIntervalMs ?? Number.POSITIVE_INFINITY;
			if (subFastest < newFastest) {
				newFastest = subFastest;
			}
		}

		this.#fastestRefreshInterval = newFastest;
		if (prevFastest !== newFastest) {
			this.#onFastestIntervalChange();
		}
	}

	subscribe(options: SubscriptionInitOptions): () => void {
		// Destructuring properties so that they can't be fiddled with after
		// this function call ends
		const { targetRefreshIntervalMs, onUpdate } = options;
		const { minimumRefreshIntervalMs } = this.#latestSnapshot.config;

		const isTargetValid =
			targetRefreshIntervalMs === Number.POSITIVE_INFINITY ||
			(Number.isInteger(targetRefreshIntervalMs) &&
				targetRefreshIntervalMs > 0);
		if (!isTargetValid) {
			throw new Error(
				`Target refresh interval must be positive infinity or a positive integer (received ${targetRefreshIntervalMs} ms)`,
			);
		}

		const subsOnSetup = this.#subscriptions;
		let subscribed = true;
		const ctx: SubscriptionContext = {
			timeSync: this,
			registeredAtMs: getMonotonicTimeMs() - this.#initializedAtMs,
			refreshIntervalMs: Math.max(
				minimumRefreshIntervalMs,
				targetRefreshIntervalMs,
			),

			unsubscribe: () => {
				// Not super conventional, but basically using try/finally as a form of
				// Go's defer. There are a lot of branches we need to worry about for
				// the unsubscribe callback, and we need to make sure we flip subscribed
				// to false after each one
				try {
					if (!subscribed || this.#subscriptions !== subsOnSetup) {
						return;
					}
					const contexts = subsOnSetup.get(onUpdate);
					if (contexts === undefined) {
						return;
					}

					// Sadly, we can't do an in-place filter here to reduce memory usage,
					// because the rest of the system requires that all contexts be
					// defined as readonly arrays on subscription updates
					const filtered = contexts.filter(
						(c) => c.unsubscribe !== ctx.unsubscribe,
					);
					if (filtered.length === contexts.length) {
						return;
					}

					const dropped = Math.max(0, this.#latestSnapshot.subscriberCount - 1);
					this.#latestSnapshot = freezeSnapshot({
						...this.#latestSnapshot,
						subscriberCount: dropped,
					});

					if (filtered.length > 0) {
						// No need to sort on removal because everything gets sorted as
						// it enters the subscriptions map
						subsOnSetup.set(onUpdate, filtered);
					} else {
						subsOnSetup.delete(onUpdate);
					}

					this.#updateFastestInterval();
				} finally {
					subscribed = false;
				}
			},
		};
		Object.freeze(ctx);

		// We need to make sure that each array for tracking subscriptions is
		// readonly, and because dispatching updates should be far more common than
		// adding subscriptions, we're placing the immutable copying here to
		// minimize overall pressure on the system.
		const prevContexts = subsOnSetup.get(onUpdate);
		let newContexts: SubscriptionContext[];
		if (prevContexts === undefined) {
			newContexts = [];
		} else {
			newContexts = [...prevContexts];
		}
		subsOnSetup.set(onUpdate, newContexts);
		insertContext(newContexts, ctx);

		this.#latestSnapshot = freezeSnapshot({
			...this.#latestSnapshot,
			subscriberCount: this.#latestSnapshot.subscriberCount + 1,
		});

		this.#updateFastestInterval();
		return ctx.unsubscribe;
	}

	getStateSnapshot(): Snapshot {
		return this.#latestSnapshot;
	}

	clearAll(): void {
		clearInterval(this.#intervalId);
		this.#intervalId = undefined;
		this.#fastestRefreshInterval = Number.POSITIVE_INFINITY;

		// As long as we clean things the internal state, it's safe not to
		// bother calling each unsubscribe callback. Not calling them one by
		// one actually has much better time complexity
		this.#subscriptions.clear();

		// We swap the map out so that the unsubscribe callbacks can detect
		// whether their functionality is still relevant
		this.#subscriptions = new Map();

		this.#latestSnapshot = freezeSnapshot({
			...this.#latestSnapshot,
			subscriberCount: 0,
		});
	}
}
