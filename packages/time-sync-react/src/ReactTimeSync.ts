import { ReadonlyDate, refreshRates, TimeSync } from "@buenos-nachos/time-sync";
import { noOp, structuralMerge, type TransformCallback } from "./utilities";

export type ReactTimeSyncGetter = () => ReactTimeSync;

type LifeCycle = "initialized" | "mounted" | "disposed";

type onReactStateSync = () => void;

interface ReactSubscriptionOptions {
	readonly hookId: string;
	readonly targetRefreshIntervalMs: number;
	readonly transform: TransformCallback<unknown>;
	readonly onReactStateSync: onReactStateSync;
}

interface SubscriptionEntry<T> {
	readonly date: ReadonlyDate;
	readonly cachedTransformation: T;
	readonly onReactStateSync: () => void;
	readonly unsubscribe: onReactStateSync;
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
	readonly #batchRefresh: () => void;

	#batchRefreshId: number | undefined;
	#intervalId: NodeJS.Timeout | number | undefined;
	#fallbackSubscription: SubscriptionEntry<null>;
	#lifecycle: LifeCycle;
	#timeSync: TimeSync;

	constructor(timeSync?: TimeSync) {
		this.#timeSync = timeSync ?? new TimeSync();
		this.subscriptions = new Map();
		this.#intervalId = undefined;
		this.#batchRefreshId = undefined;

		this.#fallbackSubscription = {
			unsubscribe: noOp,
			onReactStateSync: noOp,
			cachedTransformation: null,
			date: this.#timeSync.getStateSnapshot().date,
		};

		this.#batchRefresh = () => {
			// Serializing entries before looping just to be extra safe and make
			// sure there's no risk of infinite loops from the iterator protocol
			const entries = [...this.subscriptions.values()];
			for (const entry of entries) {
			}

			this.#batchRefreshId = undefined;
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
			const preSeedOverride = {
				...this.#fallbackSubscription,
				cachedTransformation: newValue,
			};
			this.subscriptions.set(hookId, preSeedOverride);
			return;
		}

		// This method is expected to be called from useEffect, which will
		// already provide one layer of protection for change detection. But it
		// doesn't hurt to have double book-keeping
		if (entry.cachedTransformation !== newValue) {
			const entryOverride = { ...entry, cachedTransformation: newValue };
			this.subscriptions.set(hookId, entryOverride);
		}
	}

	subscribe(options: ReactSubscriptionOptions): () => void {
		if (this.#lifecycle !== "mounted") {
			throw new Error("Cannot add subscription while system is not mounted");
		}

		const { hookId, targetRefreshIntervalMs, transform, onReactStateSync } =
			options;

		// Even though TimeSync's unsubcribe has protections against
		// double-calls, we should add another layer here, because React
		// doesn't say whether it reuses hook IDs after a component unmounts
		let subscribed = true;
		const fullUnsubscribe = () => {
			if (!subscribed) {
				return;
			}
			rootUnsubscribe();
			this.subscriptions.delete(hookId);
			subscribed = false;
		};

		const rootUnsubscribe = this.#timeSync.subscribe({
			targetRefreshIntervalMs,
			onUpdate: (newDate) => {
				const entry =
					this.subscriptions.get(hookId) ?? this.#fallbackSubscription;

				const oldTransformed = entry.cachedTransformation;
				const newTransformed = transform(newDate);
				const merged = structuralMerge(oldTransformed, newTransformed);

				if (merged === oldTransformed) {
					this.subscriptions.set(hookId, {
						date: newDate,
						onReactStateSync,
						unsubscribe: fullUnsubscribe,
						cachedTransformation: oldTransformed,
					});
					return;
				}

				this.subscriptions.set(hookId, {
					date: newDate,
					onReactStateSync,
					unsubscribe: fullUnsubscribe,
					cachedTransformation: merged,
				});
				onReactStateSync();
			},
		});

		return fullUnsubscribe;
	}

	getSubscriptionEntry<T>(hookId: string): SubscriptionEntry<T> {
		if (this.#lifecycle !== "mounted") {
			throw new Error("Cannot access subscription while system is not mounted");
		}

		return (this.subscriptions.get(hookId) ??
			this.#fallbackSubscription) as SubscriptionEntry<T>;
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

		const refreshAllDatesWithoutReactSync = (newDate: ReadonlyDate): void => {
			const newDateTime = newDate.getTime();

			if (this.#fallbackSubscription.date.getTime() < newDateTime) {
				this.#fallbackSubscription = {
					...this.#fallbackSubscription,
					date: newDate,
				};
			}

			for (const [hookId, entry] of this.subscriptions) {
				if (entry.date.getTime() < newDateTime) {
					this.subscriptions.set(hookId, {
						...entry,
						date: newDate,
					});
				}
			}
		};

		const rootUnsub = this.#timeSync.subscribe({
			targetRefreshIntervalMs: refreshRates.idle,
			onUpdate: refreshAllDatesWithoutReactSync,
		});

		this.#intervalId = setInterval(() => {
			const newDate = new ReadonlyDate();
			refreshAllDatesWithoutReactSync(newDate);
		}, ReactTimeSync.#stalenessThresholdMs);

		return () => {
			clearInterval(this.#intervalId);
			rootUnsub();
			if (this.#batchRefreshId !== undefined) {
				cancelAnimationFrame(this.#batchRefreshId);
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
		if (this.#batchRefreshId !== undefined) {
			return;
		}

		this.#batchRefreshId = requestAnimationFrame(this.#batchRefresh);
	}
}
