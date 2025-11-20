import { ReadonlyDate, TimeSync } from "../../time-sync/src";
import {
	type InitialDate,
	noOp,
	structuralMerge,
	type TransformCallback,
} from "./general";

/**
 * A version of TimeSync that deliberately hides the dispose method to prevent
 * the app from accidentally blowing up.
 */
export type TimeSyncWithoutDispose = Readonly<Omit<TimeSync, "dispose">>;

// All properties in this type are mutable on purpose
type TransformationEntry = {
	unsubscribe: () => void;
	cachedTransformation: unknown;
};

type ReactTimeSyncInitOptions = Readonly<{
	initialDate: InitialDate;
	freezeUpdates: boolean;
}>;

type ReactSubscriptionHandshake = Readonly<{
	componentId: string;
	targetRefreshIntervalMs: number;
	transform: TransformCallback<unknown>;
	onReactStateSync: () => void;
}>;

/**
 * A wrapper over TimeSync that handles managing the lifecycles of all
 * components that consume TimeSync through React hooks.
 *
 * This class is one giant implementation detail, and should not ever be
 * exported to end users.
 *
 * Because you can't share generics at a module level, the class also uses a
 * bunch of `unknown` types to handle storing arbitrary data.
 */
export class ReactTimeSync {
	static readonly #stalenessThresholdMs = 250;

	// Each string key is a globally-unique ID that identifies a specific React
	// component instance (i.e., two React Fiber entries made from the same
	// function component should have different IDs)
	readonly #entries: Map<string, TransformationEntry>;
	readonly #timeSync: TimeSync;
	readonly #timeSyncWithoutDispose: TimeSyncWithoutDispose;

	#isProviderMounted: boolean;
	#invalidationIntervalId: NodeJS.Timeout | number | undefined;

	/**
	 * Used to "batch" up multiple calls to this.syncAllSubscribersOnMount after
	 * a given render phase, and make sure that no matter how many component
	 * instances are newly mounted, the logic only fires once. This logic is
	 * deeply dependent on useLayoutEffect's API, which blocks DOM painting
	 * until all the queued layout effects fire
	 *
	 * useAnimationFrame gives us a way to detect when all our layout effects
	 * have finished processing and have produced new UI on screen.
	 *
	 * This pattern for detecting when layout effects fire is normally NOT safe,
	 * but because all the mounting logic is synchronous, that gives us
	 * guarantees that when a new animation frame is available, there will be
	 * no incomplete/in-flight effects from the hook. We don't want to throttle
	 * calls, because rapid enough updates could outpace the throttle threshold,
	 * which could cause some updates to get dropped
	 *
	 * @todo Double-check that cascading layout effects does cause the painting
	 * to be fully blocked until everything settles down.
	 */
	#batchMountUpdateId: number | undefined;

	constructor(options?: Partial<ReactTimeSyncInitOptions>) {
		const { initialDate: init, freezeUpdates } = options ?? {};
		const initialDate = typeof init === "function" ? init() : init;

		this.#isProviderMounted = true;
		this.#invalidationIntervalId = undefined;
		this.#entries = new Map();

		const sync = new TimeSync({ initialDate, freezeUpdates });
		this.#timeSync = sync;
		this.#timeSyncWithoutDispose = {
			subscribe: (handshake) => sync.subscribe(handshake),
			getStateSnapshot: () => sync.getStateSnapshot(),
			invalidateState: (options) => sync.invalidateState(options),
		};
	}

	// Only safe to call inside a render that is bound to useSyncExternalStore
	// in some way
	getDateSnapshot(): ReadonlyDate {
		return this.#timeSync.getStateSnapshot().date;
	}

	// Always safe to call inside a render
	getTimeSync(): TimeSync {
		return this.#timeSync;
	}

	getTimeSyncWithoutDispose(): TimeSyncWithoutDispose {
		return this.#timeSyncWithoutDispose;
	}

	subscribe(rsh: ReactSubscriptionHandshake): () => void {
		if (!this.#isProviderMounted) {
			return noOp;
		}

		const {
			componentId,
			targetRefreshIntervalMs,
			onReactStateSync,
			transform,
		} = rsh;

		/**
		 * This if statement is handling two situations:
		 * 1. The activeEntry already exists because it was pre-seeded with data
		 *    (in which case, the existing transformation is safe to reuse)
		 * 2. An unsubscribe didn't trigger before setting up a new subscription
		 *    for the same component instance. This should be impossible, but
		 *    better to be defensive
		 */
		let activeEntry = this.#entries.get(componentId);
		if (activeEntry !== undefined) {
			activeEntry.unsubscribe();
			activeEntry.unsubscribe = noOp;
		} else {
			activeEntry = {
				unsubscribe: noOp,
				cachedTransformation: transform(this.getDateSnapshot()),
			};
			this.#entries.set(componentId, activeEntry);
		}

		const unsubscribeFromRootSync = this.#timeSync.subscribe({
			targetRefreshIntervalMs,
			onUpdate: (newDate) => {
				const entry = this.#entries.get(componentId);
				if (entry === undefined) {
					return;
				}

				const oldState = entry.cachedTransformation;
				const newState = transform(newDate);
				const merged = structuralMerge(oldState, newState);

				if (oldState !== merged) {
					entry.cachedTransformation = merged;
					onReactStateSync();
				}
			},
		});

		const unsubscribe = (): void => {
			unsubscribeFromRootSync();
			this.#entries.delete(componentId);
		};
		activeEntry.unsubscribe = unsubscribe;

		// Regardless of how the subscription happened, update all other
		// subscribers to get them in sync with the newest state
		const shouldInvalidateDate =
			new ReadonlyDate().getTime() -
				this.#timeSync.getStateSnapshot().date.getTime() >
			ReactTimeSync.#stalenessThresholdMs;
		if (shouldInvalidateDate) {
			void this.#timeSync.invalidateState({
				// This is normally a little risky, but because of how the
				// onUpdate callback above is defined, dispatching a
				// subscription update doesn't always trigger a re-render
				notificationBehavior: "always",
			});
		}

		return unsubscribe;
	}

	updateComponentState(componentId: string, newValue: unknown): void {
		if (!this.#isProviderMounted) {
			return;
		}

		// If we're invalidating the transformation before a subscription has
		// been set up, then we almost definitely need to pre-seed the class
		// with data. We want to avoid callingredundant transformations since we
		// don't know in advance how expensive transformations can get
		const entry = this.#entries.get(componentId);
		if (entry === undefined) {
			this.#entries.set(componentId, {
				unsubscribe: noOp,
				cachedTransformation: newValue,
			});
			return;
		}

		// It's expected that whichever hook is calling this method will have
		// already created the new value via structural sharing. Calling this
		// again should just return out the old state. But if something goes
		// wrong, having an extra merge step removes some potential risks
		const merged = structuralMerge(entry.cachedTransformation, newValue);
		entry.cachedTransformation = merged;
	}

	// Always safe to call inside a render
	getComponentSnapshot<T>(componentId: string): T {
		// It's super important that we have this function be set up to always
		// return a value, because on mount, useSyncExternalStore will call the
		// state getter before the subscription has been set up
		const prev = this.#entries.get(componentId);
		if (prev !== undefined) {
			return prev.cachedTransformation as T;
		}

		const latestDate = this.#timeSync.getStateSnapshot();
		return latestDate as T;
	}

	syncAllSubscribersOnMount(): void {
		/**
		 * It's hokey to think about, but this logic *should* still work in the
		 * event that layout effects cause other useTimeSync consumers to mount.
		 *
		 * Even though a layout effect might produce 2+ new render passes
		 * before paint (each with their own layout effects), React will still
		 * be in control of the event loop the entire time. There's no way for
		 * any other TimeSync logic to fire or update state. So while the extra
		 * mounting components will technically never be able to dispatch their
		 * own syncs, we can reuse the state produced from the original sync.
		 *
		 * @todo There is a chance that if any given render pass takes an
		 * especially long time, and we have subscribers that need updates
		 * faster than every second. In that case, reusing an old snapshot
		 * across multiple cascading layout renders might not be safe. But better
		 * to hold off on handling that edge case for now.
		 */
		if (!this.#isProviderMounted || this.#batchMountUpdateId !== undefined) {
			return;
		}

		this.#batchMountUpdateId = requestAnimationFrame(() => {
			this.#batchMountUpdateId = undefined;
		});

		void this.#timeSync.invalidateState({
			notificationBehavior: "onChange",
		});
	}

	onProviderMount(): () => void {
		if (!this.#isProviderMounted) {
			return noOp;
		}

		// Periodially invalidate the state, so that even if all subscribers
		// have really slow refresh intervals, when a new component gets
		// mounted, it will be guaranteed to have "fresh-ish" data.
		this.#invalidationIntervalId = setInterval(() => {
			this.#timeSync.invalidateState({
				stalenessThresholdMs: ReactTimeSync.#stalenessThresholdMs,
				notificationBehavior: "never",
			});
		}, ReactTimeSync.#stalenessThresholdMs);

		const cleanup = () => {
			this.#isProviderMounted = false;
			clearInterval(this.#invalidationIntervalId);
			this.#invalidationIntervalId = undefined;
			this.#timeSync.dispose();
			this.#entries.clear();

			if (this.#batchMountUpdateId !== undefined) {
				cancelAnimationFrame(this.#batchMountUpdateId);
				this.#batchMountUpdateId = undefined;
			}
		};

		return cleanup;
	}
}
