import { ReadonlyDate, refreshRates, TimeSync } from "@buenos-nachos/time-sync";
import { noOp, structuralMerge, type TransformCallback } from "./utilities";

export type ReactTimeSyncGetter = () => ReactTimeSync;

export interface SubscriptionData<T> {
	readonly date: ReadonlyDate;
	readonly cachedTransformation: T;
}

interface SubscriptionEntry<T> {
	readonly onReactStateSync: () => void;
	readonly transform: TransformCallback<T>;
	// The data value itself MUST be readonly, but the key is being kept mutable
	// on purpose. We'll be swapping in different values over time, but by keeping
	// the values themselves readonly, they become render-safe
	data: SubscriptionData<T>;
}

interface SubscriptionInit<T> {
	readonly hookId: string;
	readonly initialValue: T;
	readonly targetRefreshIntervalMs: number;
	readonly transform: TransformCallback<T>;
	readonly onStateSync: () => void;
}

const stalenessThresholdMs = 200;

function isFrozen(sync: TimeSync): boolean {
	return sync.getStateSnapshot().config.freezeUpdates;
}

// Represents the three lifecycles that a ReactTimeSync instance is expected to
// go through as it gets integrated into a UI. The statuses are expected to
// progress in order
const reactTimeSyncStatuses = [
	"idle",
	"initialized",
	"mounted",
] as const satisfies readonly string[];

type ReactTimeSyncStatus = (typeof reactTimeSyncStatuses)[number];

/**
 * If a method returns a function, it's expected that:
 * 1. The method must be called from inside some kind of useEffect call
 *    (useEffect, useLayoutEffect, useInsertionEffect).
 * 2. The returned function is a cleanup function.
 */
interface ReactTimeSyncApi {
	/**
	 * Registers a new subscription with ReactTimeSync (and its underlying
	 * TimeSync instance).
	 *
	 * When a new date is dispatched from the underlying TimeSync, ReactTimeSync
	 * will process the date first, and apply any necessary data
	 * transformations. If the new transformation isn't different enough from
	 * the previous one (judged by value equality), React will NOT be notified.
	 */
	subscribe: <T>(options: SubscriptionInit<T>) => () => void;

	/**
	 * Takes an ID value (ideally produced by React itself) and initializes the
	 * ReactTimeSync instance with it. The ReactTimeSync instance will then be
	 * initialized and ready for mounting.
	 */
	onAppInit: (newAppId: string) => () => void;

	/**
	 * Handles mounting the provider, handling all logic necessary for hydrating
	 * all useTimeSync subscribers with accurate data.
	 */
	onProviderMount: () => () => void;

	/**
	 * Exposes a stable version of ReactTimeSync's underlying TimeSync instance.
	 */
	getTimeSync: () => TimeSync;

	/**
	 * The callback that should always be called from a layout effect when
	 * useTimeSync is mounted.
	 */
	onComponentMount: () => () => void;

	/**
	 * Attempts to grab the transformation and date currently registered with
	 * a specific hook ID. If there is no matching data entry, fallback data is
	 * returned instead, where the date is the most recent date that was
	 * processed globally, and the transformation is null.
	 *
	 * This class uses the `unknown` type to store arbitrary data internally,
	 * and by default, that is reflected in the return type. If you know what
	 * you are doing, you can pass a custom type parameter to override the
	 * type information.
	 */
	getSubscriptionData: <T = unknown>(
		hookId: string,
	) => SubscriptionData<T | null>;

	/**
	 * Updates the cached transformation registered with a given hook ID. By
	 * design, it does nothing else.
	 *
	 * This gives the ReactTimeSync fresher data to work with when new date
	 * updates get dispatched from the TimeSync, and helps minimize needless
	 * re-renders.
	 *
	 * If there is no entry associated with the ID, the method does nothing.
	 */
	invalidateTransformation: (hookId: string, newValue: unknown) => () => void;
}

/**
 * A central class for managing all core state management, communication, and
 * synchronization between time-sync-react hooks and providers.
 */
// This is a little screwy to think about, because it's something that React's
// core APIs don't expose to end-users, but a lot of this class deals with state
// that's halfway between traditional render-safe state (i.e.,
// useState/useReducer) and full-on ref state. We need to make sure that all
// values are still defined in an immutable, stable way, but we don't always
// need to trigger re-renders in response to them changing.
export class ReactTimeSync implements ReactTimeSyncApi {
	/**
	 * Have to store this with type unknown, because we need to be able to store
	 * arbitrary data, and if we add a type parameter at the class level, that
	 * forces all subscriptions to use the exact same transform type.
	 */
	readonly #subscriptions: Map<string, SubscriptionEntry<unknown>>;
	readonly #timeSync: TimeSync;

	#activeAppId: string | null;
	#status: ReactTimeSyncStatus;
	#fallbackData: SubscriptionData<null>;
	#dateRefreshIntervalId: NodeJS.Timeout | number | undefined;
	#componentMountThrottleId: NodeJS.Timeout | number | undefined;

	constructor(timeSync?: TimeSync) {
		this.#status = "idle";
		this.#subscriptions = new Map();
		this.#dateRefreshIntervalId = undefined;
		this.#componentMountThrottleId = undefined;
		this.#activeAppId = null;

		const sync = timeSync ?? new TimeSync();
		this.#timeSync = sync;
		const snap = sync.getStateSnapshot();
		this.#fallbackData = { cachedTransformation: null, date: snap.date };
	}

	#refreshAllSubscribers(): () => void {
		if (this.#componentMountThrottleId !== undefined) {
			return noOp;
		}

		// Serializing entries before looping just to be extra safe and make
		// sure there's no risk of infinite loops from the iterator protocol
		const entries = [...this.#subscriptions.values()];
		for (const entry of entries) {
			const { date, cachedTransformation } = entry.data;
			const newTransform = entry.transform(date);
			const merged = structuralMerge(cachedTransformation, newTransform);

			if (cachedTransformation === merged) {
				continue;
			}

			entry.data = { date: date, cachedTransformation: merged };
			entry.onReactStateSync();
		}

		// Immediately queue up the throttle to be cleared at the browser's nearest
		// possible convenience, but still force the update to go through the
		// macrotask queue so that if a bunch of components mount at the same time,
		// you have the wait for a repaint before being able to have this method
		// process anything again
		const newId = setTimeout(() => {
			clearTimeout(this.#componentMountThrottleId);
			this.#componentMountThrottleId = undefined;
		}, 0);
		this.#componentMountThrottleId = newId;

		return () => {
			// Adding this check to prevent race conditions from previous cleanups
			// wiping out a timeout that was started by a different component
			if (this.#componentMountThrottleId !== newId) {
				return;
			}
			clearTimeout(this.#componentMountThrottleId);
			this.#componentMountThrottleId = undefined;
		};
	}

	getTimeSync(): TimeSync {
		if (this.#status === "idle") {
			throw new Error(
				"Cannot get TimeSync instance while system is not initialized",
			);
		}
		return this.#timeSync;
	}

	invalidateTransformation(hookId: string, newValue: unknown): () => void {
		if (this.#status === "idle") {
			throw new Error(
				"Cannot invalidate transformation while system is not initialized",
			);
		}

		const entry = this.#subscriptions.get(hookId);
		if (entry === undefined) {
			return noOp;
		}

		// This method is expected to be called from useEffect, which will
		// already provide one layer of protection for change detection. But it
		// doesn't hurt to have double book-keeping
		if (entry.data.cachedTransformation !== newValue) {
			entry.data = {
				date: entry.data.date,
				cachedTransformation: newValue,
			};
		}

		return noOp;
	}

	subscribe<T>(options: SubscriptionInit<T>): () => void {
		if (this.#status === "idle") {
			throw new Error("Cannot subscribe while system is not initialized");
		}

		const {
			hookId,
			initialValue,
			targetRefreshIntervalMs,
			transform,
			onStateSync: onReactStateSync,
		} = options;

		this.#subscriptions.set(hookId, {
			onReactStateSync,
			transform,
			data: {
				cachedTransformation: initialValue,
				date: this.#fallbackData.date,
			},
		});

		// Even though TimeSync's unsubscribe has protections against
		// double-calls, we should add another layer here, because React
		// doesn't say whether it reuses hook IDs after a component unmounts,
		// and removing the same ID multiple times could be destructive
		let subscribed = true;
		const fullUnsubscribe = () => {
			if (!subscribed) {
				return;
			}
			rootUnsubscribe();
			this.#subscriptions.delete(hookId);
			subscribed = false;
		};

		const rootUnsubscribe = this.#timeSync.subscribe({
			targetRefreshIntervalMs,
			onUpdate: (newDate) => {
				// Not accessing newEntry from closure just to be on the safe
				// side and make sure we can't access a subscription after it's
				// been removed
				const entry = this.#subscriptions.get(hookId);
				if (entry === undefined) {
					return;
				}

				const oldTransformed = entry.data.cachedTransformation;
				const newTransformed = transform(newDate);
				const merged = structuralMerge(oldTransformed, newTransformed);

				if (merged === oldTransformed) {
					entry.data = {
						date: newDate,
						cachedTransformation: oldTransformed,
					};
					return;
				}

				entry.data = { date: newDate, cachedTransformation: merged };
				onReactStateSync();
			},
		});

		return fullUnsubscribe;
	}

	getSubscriptionData<T = unknown>(hookId: string): SubscriptionData<T | null> {
		if (this.#status === "idle") {
			throw new Error(
				"Cannot access subscription while system is not initialized",
			);
		}

		const entry = this.#subscriptions.get(hookId);
		if (entry !== undefined) {
			return entry.data as SubscriptionData<T>;
		}

		return this.#fallbackData;
	}

	onAppInit(appId: string): () => void {
		if (this.#status !== "idle") {
			throw new Error(
				`Trying to initialize ReactTimeSync after it's reached status "${this.#status}"`,
			);
		}

		// Because we can't control how much time can elapse between components
		// mounting, we need some kind of way of refreshing the fallback date
		// so that we can guarantee a fresh value when a new component mounts
		const refreshFallbackDate = (newDate: ReadonlyDate): void => {
			this.#fallbackData = { cachedTransformation: null, date: newDate };
		};
		this.#timeSync.subscribe({
			targetRefreshIntervalMs: refreshRates.idle,
			onUpdate: refreshFallbackDate,
		});
		this.#dateRefreshIntervalId = setInterval(() => {
			const newDate = new ReadonlyDate();
			refreshFallbackDate(newDate);
		}, stalenessThresholdMs);

		this.#activeAppId = appId;
		this.#status = "initialized";

		let cleanedUp = false;
		const cleanup = () => {
			if (cleanedUp || this.#activeAppId !== appId) {
				cleanedUp = true;
				return;
			}

			// This also cleans up the subscription registered above
			this.#timeSync.clearAll();
			clearInterval(this.#dateRefreshIntervalId);
			this.#dateRefreshIntervalId = undefined;

			clearTimeout(this.#componentMountThrottleId);
			this.#componentMountThrottleId = undefined;

			this.#subscriptions.clear();
			this.#status = "idle";
			cleanedUp = true;
		};
		return cleanup;
	}

	onProviderMount(): () => void {
		if (this.#status === "idle") {
			throw new Error("Cannot mount provider before app has been initialized");
		}
		if (this.#status === "mounted") {
			throw new Error(
				"Trying to mount provider after it's already been mounted",
			);
		}

		this.#status = "mounted";
		let cleanupPendingRefresh = noOp;
		if (!isFrozen(this.#timeSync)) {
			cleanupPendingRefresh = this.#refreshAllSubscribers();
		}

		const appIdOnMount = this.#activeAppId;
		let cleanedUp = false;
		return () => {
			if (cleanedUp || this.#activeAppId !== appIdOnMount) {
				cleanedUp = true;
				return;
			}

			cleanupPendingRefresh();
			this.#status = "initialized";
			cleanedUp = true;
		};
	}

	onComponentMount(): () => void {
		if (this.#status === "idle") {
			throw new Error(
				"Cannot process component initialization while system is not initialized",
			);
		}

		// If we're not mounted yet, then we're hoping that the provider will handle
		// updating all subscribers when it handles mounting.
		const shouldProceed =
			this.#status === "mounted" && !isFrozen(this.#timeSync);
		if (!shouldProceed) {
			return noOp;
		}

		const cleanupPendingRefresh = this.#refreshAllSubscribers();
		return cleanupPendingRefresh;
	}
}
