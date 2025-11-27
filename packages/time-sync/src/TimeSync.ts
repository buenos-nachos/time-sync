import { ReadonlyDate } from "./ReadonlyDate";
import type { Writeable } from "./utilities";

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
	 * tests.
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
	 * good reason. Updating this value to be too low and make the event loop
	 * get really hot and really tank performance elsewhere in an application.
	 *
	 * Defaults to 200ms.
	 */
	readonly minimumRefreshIntervalMs: number;

	/**
	 * Indicates whether the same `onUpdate` callback (by reference) should be
	 * called multiple time if registered by multiple systems.
	 *
	 * Defaults to true. If this value is flipped to false, each onUpdate
	 * callback will receive the subscription context for the FIRST subscriber
	 * that registered the onUpdate callback.
	 */
	readonly allowDuplicateOnUpdateCalls: boolean;
}

/**
 * The set of options that can be used to instantiate a TimeSync.
 */
export interface InitOptions extends Configuration {
	/**
	 * Indicates whether the TimeSync instance should be frozen for snapshot
	 * tests. Highly encouraged that you use this together with
	 * `initialDate`.
	 *
	 *  Defaults to false.
	 */
	// Duplicated property to override the LSP comment
	readonly freezeUpdates: boolean;

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
	 * The date that was last dispatched to all subscribers.
	 */
	readonly date: ReadonlyDate;

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
 * TimeSync.
 *
 * For performance reasons, this object has ZERO readonly guarantees enforced at
 * runtime. A few properties are flagged as readonly at the type level, but
 * misuse of this value has a risk of breaking a TimeSync instance's internal
 * state. Proceed with caution.
 */
export interface SubscriptionContext {
	/**
	 * The interval that the subscription was registered with.
	 */
	readonly targetRefreshIntervalMs: number;

	/**
	 * The unsubscribe callback associated with a subscription. This is the same
	 * callback returned by `TimeSync.subscribe`.
	 */
	readonly unsubscribe: () => void;

	/**
	 * A timestamp of when the subscription was first set up.
	 */
	readonly registeredAt: ReadonlyDate;

	/**
	 * A reference to the TimeSync instance that the subscription was registered
	 * with.
	 */
	readonly timeSync: TimeSync;

	/**
	 * Indicates whether the subscription is still live. Will be mutated to be
	 * false when a subscription is
	 */
	isSubscribed: boolean;

	/**
	 * Indicates when the last time the subscription had its explicit interval
	 * "satisfied".
	 *
	 * For example, if a subscription is registered for every five minutes, but
	 * the active interval is set to fire every second, you may need to know
	 * which update actually happened five minutes later.
	 */
	intervalLastFulfilledAt: ReadonlyDate | null;
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
	 * @throws {RangeError} If the provided interval is not either a positive
	 * integer or positive infinity.
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

/* biome-ignore lint:suspicious/noEmptyBlockStatements -- Rare case where we do
   actually want a completely empty function body. */
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

	/**
	 * The latest public snapshot of TimeSync's internal state. The snapshot
	 * should always be treated as an immutable value.
	 */
	#latestSnapshot: Snapshot;

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

		// Not defined inline to avoid wonkiness that Object.freeze introduces
		// when you rename a property on a frozen object
		const initialSnapshot: Snapshot = {
			subscriberCount: 0,
			date: initialDate ? new ReadonlyDate(initialDate) : new ReadonlyDate(),
			config: Object.freeze({
				freezeUpdates,
				minimumRefreshIntervalMs,
				allowDuplicateOnUpdateCalls,
			}),
		};
		this.#latestSnapshot = Object.freeze(initialSnapshot);
	}

	#setSnapshot(update: Partial<Snapshot>): boolean {
		const { date, subscriberCount, config } = this.#latestSnapshot;
		if (config.freezeUpdates) {
			return false;
		}

		// Avoiding both direct property assignment or spread syntax because
		// Object.freeze causes weird TypeScript LSP issues around assignability
		// where trying to rename a property. If you rename a property on a
		// type, it WON'T rename the runtime properties. Object.freeze
		// introduces an extra type boundary that break the linking
		const updated: Snapshot = {
			// Always reject any new configs because trying to remove them at
			// the type level isn't worth it for an internal implementation
			// detail
			config,
			date: update.date ?? date,
			subscriberCount: update.subscriberCount ?? subscriberCount,
		};

		this.#latestSnapshot = Object.freeze(updated);
		return true;
	}

	#notifyAllSubscriptions(): void {
		// It's more important that we copy the date object into a separate
		// variable here than normal, because need make sure the `this` context
		// can't magically change between updates and cause subscribers to
		// receive different values (e.g., one of the subscribers calls the
		// invalidate method)
		const { date, config } = this.#latestSnapshot;

		// We still need to let the logic go through if the current fastest
		// interval is Infinity, so that we can support letting any arbitrary
		// consumer invalidate the date immediately
		const subscriptionsPaused =
			config.freezeUpdates || this.#subscriptions.size === 0;
		if (subscriptionsPaused) {
			return;
		}

		const dateTime = date.getTime();

		/**
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
		const entries = Array.from(subsBeforeUpdate);
		outer: for (const [onUpdate, subs] of entries) {
			// Even if duplicate onUpdate calls are disabled, we still need to
			// iterate through everything and update any internal data. If the
			// first context in a sub array gets removed by unsubscribing, we
			// want what was the the second element to still be up to date
			let shouldCallOnUpdate = true;
			for (const context of subs) {
				// We're not doing anything more sophisticated here because
				// we're assuming that any systems that can clear out the
				// subscriptions will handle cleaning up each context, too
				const wasCleared = subsBeforeUpdate.size === 0;
				if (wasCleared) {
					break outer;
				}

				const comparisonDate =
					context.intervalLastFulfilledAt ?? context.registeredAt;
				const isIntervalMatch =
					dateTime - comparisonDate.getTime() >=
					context.targetRefreshIntervalMs;
				if (isIntervalMatch) {
					context.intervalLastFulfilledAt = date;
				}

				if (shouldCallOnUpdate) {
					onUpdate(date, context);
					shouldCallOnUpdate = config.allowDuplicateOnUpdateCalls;
				}
			}
		}
	}

	/**
	 * The logic that should happen at each step in TimeSync's active interval.
	 *
	 * Defined as an arrow function so that we can just pass it directly to
	 * setInterval without needing to make a new wrapper function each time. We
	 * don't have many situations where we can lose the `this` context, but this
	 * is one of them.
	 */
	readonly #onTick = (): void => {
		// Defensive step to make sure that an invalid tick wasn't started
		const { config } = this.#latestSnapshot;
		if (config.freezeUpdates) {
			clearInterval(this.#intervalId);
			this.#intervalId = undefined;
			return;
		}

		const wasChanged = this.#setSnapshot({ date: new ReadonlyDate() });
		if (wasChanged) {
			this.#notifyAllSubscriptions();
		}
	};

	#onFastestIntervalChange(): void {
		const fastest = this.#fastestRefreshInterval;
		const { date, config } = this.#latestSnapshot;
		const updatesShouldStop =
			config.freezeUpdates || fastest === Number.POSITIVE_INFINITY;
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
			const wasChanged = this.#setSnapshot({ date: new ReadonlyDate() });
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
			// that ticking would cause the TimeSync instance to be reset. We
			// don't want to start a new interval right after we've lost our
			// ability to do cleanup. The timer won't start getting processed
			// until the function leaves scope anyway
			this.#intervalId = setInterval(this.#onTick, fastest);
			this.#onTick();
		}, timeBeforeNextUpdate);
	}

	#updateFastestInterval(): void {
		const { config } = this.#latestSnapshot;
		if (config.freezeUpdates) {
			this.#fastestRefreshInterval = Number.POSITIVE_INFINITY;
			return;
		}

		const prevFastest = this.#fastestRefreshInterval;
		let newFastest = Number.POSITIVE_INFINITY;

		// This setup requires that every interval array stay sorted. It
		// immediately falls apart if this isn't guaranteed.
		for (const entries of this.#subscriptions.values()) {
			const subFastest =
				entries[0]?.targetRefreshIntervalMs ?? Number.POSITIVE_INFINITY;
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
		const { config } = this.#latestSnapshot;
		if (config.freezeUpdates) {
			return noOp;
		}

		// Destructuring properties so that they can't be fiddled with after
		// this function call ends
		const { targetRefreshIntervalMs, onUpdate } = options;

		const isTargetValid =
			targetRefreshIntervalMs === Number.POSITIVE_INFINITY ||
			(Number.isInteger(targetRefreshIntervalMs) &&
				targetRefreshIntervalMs > 0);
		if (!isTargetValid) {
			throw new Error(
				`Target refresh interval must be positive infinity or a positive integer (received ${targetRefreshIntervalMs} ms)`,
			);
		}

		// Have to define this as a writeable to avoid a chicken-and-the-egg
		// problem for the unsubscribe callback
		const context: Writeable<SubscriptionContext> = {
			isSubscribed: true,
			timeSync: this,
			unsubscribe: noOp,
			registeredAt: new ReadonlyDate(),
			intervalLastFulfilledAt: null,
			targetRefreshIntervalMs: Math.max(
				config.minimumRefreshIntervalMs,
				targetRefreshIntervalMs,
			),
		};

		// Not reading from context value to decide whether to bail out of
		// unsubscribes in off chance that outside consumer accidentally mutates
		// the value
		let subscribed = true;
		const subsOnSetup = this.#subscriptions;
		const unsubscribe = (): void => {
			if (!subscribed || this.#subscriptions !== subsOnSetup) {
				context.isSubscribed = false;
				subscribed = false;
				return;
			}

			const contexts = subsOnSetup.get(onUpdate);
			if (contexts === undefined) {
				return;
			}
			const filtered = contexts.filter((e) => e.unsubscribe !== unsubscribe);
			if (filtered.length === contexts.length) {
				return;
			}

			if (filtered.length === 0) {
				subsOnSetup.delete(onUpdate);
				this.#updateFastestInterval();
			} else {
				// No need to sort on removal because everything gets sorted as
				// it enters the subscriptions map
				subsOnSetup.set(onUpdate, filtered);
			}

			void this.#setSnapshot({
				subscriberCount: Math.max(0, this.#latestSnapshot.subscriberCount - 1),
			});

			context.isSubscribed = false;
			subscribed = false;
		};
		context.unsubscribe = unsubscribe;

		let contexts: SubscriptionContext[];
		if (this.#subscriptions.has(onUpdate)) {
			const prev = this.#subscriptions.get(onUpdate) as SubscriptionContext[];
			contexts = [...prev];
		} else {
			contexts = [];
			subsOnSetup.set(onUpdate, contexts);
		}

		subsOnSetup.set(onUpdate, contexts);
		contexts.push(context);
		contexts.sort(
			(e1, e2) => e1.targetRefreshIntervalMs - e2.targetRefreshIntervalMs,
		);

		void this.#setSnapshot({
			subscriberCount: this.#latestSnapshot.subscriberCount + 1,
		});

		this.#updateFastestInterval();
		return unsubscribe;
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
		for (const subArray of this.#subscriptions.values()) {
			for (const ctx of subArray) {
				ctx.isSubscribed = false;
			}
		}

		this.#subscriptions.clear();

		// We swap the map out so that the unsubscribe callbacks can detect
		// whether their functionality is still relevant
		this.#subscriptions = new Map();
		void this.#setSnapshot({ subscriberCount: 0 });
	}
}
