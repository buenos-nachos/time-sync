import { ReadonlyDate, refreshRates, TimeSync } from "@buenos-nachos/time-sync";
import { noOp, structuralMerge, type TransformCallback } from "./utilities";

export type ReactTimeSyncGetter = () => ReactTimeSync;

type LifeCycle = "initialized" | "mounted" | "disposed";

type onReactStateSync = () => void;

interface ReactSubscriptionOptions<T> {
	readonly hookId: string;
	readonly targetRefreshIntervalMs: number;
	readonly transform: TransformCallback<T>;
	readonly onReactStateSync: onReactStateSync;
}

interface SubscriptionData<T> {
	readonly date: ReadonlyDate;
	readonly cachedTransformation: T;
}

interface SubscriptionEntry<T> {
	readonly onReactStateSync: () => void;
	readonly transform: TransformCallback<T>;
	readonly unsubscribe: onReactStateSync;

	// The data value itself is readonly, but the key is being kept mutable on
	// purpose
	data: SubscriptionData<T>;
}

function fallbackSubscriptionTransform(): null {
	return null;
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
	static readonly #stalenessThresholdMs = 200;
	readonly subscriptions: Map<string, SubscriptionEntry<unknown>>;
	readonly #fallbackSubscription: SubscriptionEntry<null>;

	#dateRefreshBatchId: number | undefined;
	#dateRefreshIntervalId: NodeJS.Timeout | number | undefined;
	#lifecycle: LifeCycle;
	#timeSync: TimeSync;

	constructor(timeSync?: TimeSync) {
		this.#timeSync = timeSync ?? new TimeSync();
		this.subscriptions = new Map();
		this.#dateRefreshIntervalId = undefined;
		this.#dateRefreshBatchId = undefined;

		this.#fallbackSubscription = {
			unsubscribe: noOp,
			onReactStateSync: noOp,
			transform: fallbackSubscriptionTransform,
			data: {
				cachedTransformation: null,
				date: this.#timeSync.getStateSnapshot().date,
			},
		};

		this.#lifecycle = "initialized";
	}

	getTimeSync(): TimeSync {
		if (this.#lifecycle !== "mounted") {
			throw new Error("Cannot retrieve TimeSync while system is not mounted");
		}
		return this.#timeSync;
	}

	syncRenderTransformation(hookId: string, newValue: unknown): void {
		if (this.#lifecycle !== "mounted") {
			throw new Error(
				"Cannot sync transformation results while system is not mounted",
			);
		}

		const entry = this.subscriptions.get(hookId);

		// If there's no previous entry, we're assuming that a subscribe is
		// coming, and we need to pre-seed the transformation to make sure that
		// we don't do a bunch of redundant work
		if (entry === undefined) {
			const preSeedOverride: SubscriptionEntry<unknown> = {
				...this.#fallbackSubscription,
				data: {
					...this.#fallbackSubscription.data,
					cachedTransformation: newValue,
				},
			};

			this.subscriptions.set(hookId, preSeedOverride);
			return;
		}

		// This method is expected to be called from useEffect, which will
		// already provide one layer of protection for change detection. But it
		// doesn't hurt to have double book-keeping
		if (entry.data.cachedTransformation !== newValue) {
			const entryOverride: SubscriptionEntry<unknown> = {
				...entry,
				data: {
					...entry.data,
					cachedTransformation: newValue,
				},
			};

			this.subscriptions.set(hookId, entryOverride);
		}
	}

	subscribe<T>(options: ReactSubscriptionOptions<T>): () => void {
		if (this.#lifecycle !== "mounted") {
			throw new Error("Cannot add subscription while system is not mounted");
		}

		const { hookId, targetRefreshIntervalMs, transform, onReactStateSync } =
			options;

		// Even though TimeSync's unsubcribe has protections against
		// double-calls, we should add another layer here, because React
		// doesn't say whether it reuses hook IDs after a component unmounts,
		// and removing the same ID multiple times could be destructive
		let subscribed = true;
		const newEntry: SubscriptionEntry<T> = {
			onReactStateSync,
			transform,
			data: this.#fallbackSubscription.data as SubscriptionData<T>,
			unsubscribe: () => {
				if (!subscribed) {
					return;
				}
				rootUnsubscribe();
				this.subscriptions.delete(hookId);
				subscribed = false;
			},
		};
		this.subscriptions.set(hookId, newEntry);

		const rootUnsubscribe = this.#timeSync.subscribe({
			targetRefreshIntervalMs,
			onUpdate: (newDate) => {
				// Not accessing newEntry from closure just to be on the safe
				// side and make sure we can't access a subcription after it's
				// been removed
				const entry = this.subscriptions.get(hookId);
				if (entry === undefined) {
					return;
				}

				const oldTransformed = entry.data.cachedTransformation;
				const newTransformed = transform(newDate);
				const merged = structuralMerge(oldTransformed, newTransformed);

				if (merged === oldTransformed) {
					entry.data = { date: newDate, cachedTransformation: oldTransformed };
					return;
				}

				entry.data = { date: newDate, cachedTransformation: merged };
				onReactStateSync();
			},
		});

		return newEntry.unsubscribe;
	}

	getSubscriptionData<T>(hookId: string): SubscriptionData<T> {
		if (this.#lifecycle !== "mounted") {
			throw new Error("Cannot access subscription while system is not mounted");
		}

		const entry = (this.subscriptions.get(hookId) ??
			this.#fallbackSubscription) as SubscriptionEntry<T>;
		return entry.data;
	}

	// MUST be called from inside an effect, because it relies on browser APIs
	onProviderMount(timeSyncOverride?: TimeSync): () => void {
		if (this.#lifecycle !== "initialized") {
			return noOp;
		}

		this.#lifecycle = "mounted";
		if (timeSyncOverride !== undefined) {
			this.#timeSync = timeSyncOverride;
		}

		// Because we can't control how much time can elapse between components
		// mounting, we need some kind of mechanism for
		const refreshAllDatesWithoutReactSync = (newDate: ReadonlyDate): void => {
			const newDateTime = newDate.getTime();
			const fallbackData = this.#fallbackSubscription.data;
			if (fallbackData.date.getTime() < newDateTime) {
				this.#fallbackSubscription.data = {
					...fallbackData,
					date: newDate,
				};
			}

			for (const entry of this.subscriptions.values()) {
				if (entry.data.date.getTime() < newDateTime) {
					entry.data = {
						...entry.data,
						date: newDate,
					};
				}
			}
		};
		this.#timeSync.subscribe({
			targetRefreshIntervalMs: refreshRates.idle,
			onUpdate: refreshAllDatesWithoutReactSync,
		});
		this.#dateRefreshIntervalId = setInterval(() => {
			const newDate = new ReadonlyDate();
			refreshAllDatesWithoutReactSync(newDate);
		}, ReactTimeSync.#stalenessThresholdMs);

		return () => {
			// This also cleans up the subscription registered above
			this.#timeSync.clearAll();
			clearInterval(this.#dateRefreshIntervalId);
			this.subscriptions.clear();
			if (this.#dateRefreshBatchId !== undefined) {
				cancelAnimationFrame(this.#dateRefreshBatchId);
			}
			this.#lifecycle = "disposed";
		};
	}

	// MUST be called from inside an effect, because it relies on browser APIs
	onComponentMount(): void {
		if (this.#lifecycle !== "mounted") {
			throw new Error(
				"Cannot process component initialization while system is not mounted",
			);
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
			const entries = [...this.subscriptions.values()];

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
