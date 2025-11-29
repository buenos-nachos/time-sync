import { ReadonlyDate, refreshRates, TimeSync } from "@buenos-nachos/time-sync";
import { noOp, structuralMerge, type TransformCallback } from "./utilities";

export type ReactTimeSyncGetter = () => ReactTimeSync;

type onReactStateSync = () => void;

export interface SubscriptionData<T> {
	readonly date: ReadonlyDate;
	readonly cachedTransformation: T;
}

interface SubscriptionEntry<T> {
	readonly onReactStateSync: () => void;
	readonly transform: TransformCallback<T>;
	// The data value itself is readonly, but the key is being kept mutable on
	// purpose
	data: SubscriptionData<T>;
}

interface ReactSubscriptionOptions<T> {
	readonly hookId: string;
	readonly initialValue: T;
	readonly targetRefreshIntervalMs: number;
	readonly transform: TransformCallback<T>;
	readonly onReactStateSync: onReactStateSync;
}

const stalenessThresholdMs = 200;

function isFrozen(sync: TimeSync): boolean {
	return sync.getStateSnapshot().config.freezeUpdates;
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
export class ReactTimeSync {
	/**
	 * Have to store this with type unknown, because we need to be able to store
	 * arbitrary data, and if we add a type parameter at the class level, that
	 * forces all subscriptions to use the exact same transform type.
	 */
	readonly #subscriptions: Map<string, SubscriptionEntry<unknown>>;
	readonly #timeSync: TimeSync;

	#isMounted: boolean;
	#fallbackData: SubscriptionData<null>;
	#dateRefreshBatchId: number | undefined;
	#dateRefreshIntervalId: NodeJS.Timeout | number | undefined;

	constructor(timeSync?: TimeSync) {
		this.#timeSync = timeSync ?? new TimeSync();
		this.#subscriptions = new Map();
		this.#dateRefreshIntervalId = undefined;
		this.#dateRefreshBatchId = undefined;

		const snap = this.#timeSync.getStateSnapshot();
		this.#fallbackData = { cachedTransformation: null, date: snap.date };
		this.#isMounted = false;
	}

	getTimeSync(): TimeSync {
		if (!this.#isMounted) {
			throw new Error("Cannot retrieve TimeSync while system is not mounted");
		}
		return this.#timeSync;
	}

	syncTransformation(hookId: string, newValue: unknown): void {
		if (!this.#isMounted) {
			throw new Error(
				"Cannot sync transformation results while system is not mounted",
			);
		}

		const entry = this.#subscriptions.get(hookId);
		if (entry === undefined) {
			return;
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
	}

	subscribe<T>(options: ReactSubscriptionOptions<T>): () => void {
		if (!this.#isMounted) {
			throw new Error("Cannot add subscription while system is not mounted");
		}

		const {
			hookId,
			initialValue,
			targetRefreshIntervalMs,
			transform,
			onReactStateSync,
		} = options;

		this.#subscriptions.set(hookId, {
			onReactStateSync,
			transform,
			data: {
				cachedTransformation: initialValue,
				date: this.#fallbackData.date,
			},
		});

		// Even though TimeSync's unsubcribe has protections against
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
				// side and make sure we can't access a subcription after it's
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

	getSubscriptionData<T>(hookId: string): SubscriptionData<T> {
		if (!this.#isMounted) {
			throw new Error("Cannot access subscription while system is not mounted");
		}

		const data: SubscriptionData<unknown> =
			this.#subscriptions.get(hookId)?.data ?? this.#fallbackData;
		return data as SubscriptionData<T>;
	}

	// MUST be called from inside an effect, because it relies on browser APIs.
	initialize(): () => void {
		if (this.#isMounted) {
			throw new Error("Must call cleanup function before re-initializing");
		}

		this.#isMounted = true;
		if (isFrozen(this.#timeSync)) {
			return noOp;
		}

		// Because we can't control how much time can elapse between components
		// mounting, we need some kind of mechanism for refreshing the fallback
		// date is fresh so that it can be safely used when a component mounts
		const refreshFallbackDate = (newDate: ReadonlyDate): void => {
			const newDateTime = newDate.getTime();
			if (this.#fallbackData.date.getTime() < newDateTime) {
				this.#fallbackData = {
					...this.#fallbackData,
					date: newDate,
				};
			}
		};
		this.#timeSync.subscribe({
			targetRefreshIntervalMs: refreshRates.idle,
			onUpdate: refreshFallbackDate,
		});
		this.#dateRefreshIntervalId = setInterval(() => {
			const newDate = new ReadonlyDate();
			refreshFallbackDate(newDate);
		}, stalenessThresholdMs);

		const cleanup = () => {
			// This also cleans up the subscription registered above
			this.#timeSync.clearAll();
			clearInterval(this.#dateRefreshIntervalId);
			this.#subscriptions.clear();
			if (this.#dateRefreshBatchId !== undefined) {
				cancelAnimationFrame(this.#dateRefreshBatchId);
			}
			this.#isMounted = false;
		};

		this.#isMounted = true;
		return cleanup;
	}

	// MUST be called from inside an effect, because it relies on browser APIs
	onComponentMount(): void {
		if (!this.#isMounted) {
			throw new Error(
				"Cannot process component initialization while system is not mounted",
			);
		}

		if (isFrozen(this.#timeSync)) {
			return;
		}

		// Protection to make sure that if a bunch of components mount at the
		// same time, only one of them will actually cause a batch-resync
		if (this.#dateRefreshBatchId !== undefined) {
			cancelAnimationFrame(this.#dateRefreshBatchId);
		}

		// Code assumes that all entries will always have an up to date .date
		// property thanks to onProviderMount, and that only the transformations
		// could be out of sync
		this.#dateRefreshBatchId = requestAnimationFrame(() => {
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

			this.#dateRefreshBatchId = undefined;
		});
	}
}
