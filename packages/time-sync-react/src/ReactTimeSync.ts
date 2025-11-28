import { type ReadonlyDate, TimeSync } from "@buenos-nachos/time-sync";
import { noOp, type TransformCallback } from "./utilities";

export type ReactTimeSyncGetter = () => ReactTimeSync;

type ReactSubscriptionOptions = Readonly<{
	hookId: string;
	targetRefreshIntervalMs: number;
	transform: TransformCallback<unknown>;
	onReactStateSync: () => void;
}>;

interface SubscriptionCacheEntry<T> {
	readonly date: ReadonlyDate;
	readonly cachedTransformation: T;
}

export class ReactTimeSync {
	readonly #timeSync: TimeSync;

	constructor(timeSync?: TimeSync) {
		if (timeSync === undefined) {
			this.#timeSync = new TimeSync();
		} else {
			this.#timeSync = timeSync;
		}
	}

	// Definitely need this
	getTimeSync(): TimeSync {
		return this.#timeSync;
	}

	// Everything below this line is still a work in progress //////////////////

	syncRenderTransformation(hookId: string, newValue: unknown): void {}

	subscribe(options: ReactSubscriptionOptions): () => void {
		return noOp;
	}

	getCacheEntry<T>(hookId: string): SubscriptionCacheEntry<T> {
		return {
			date: this.#timeSync.getStateSnapshot().date,
			cachedTransformation: "",
		} as SubscriptionCacheEntry<T>;
	}

	onProviderMount(): () => void {
		return noOp;
	}

	onTimeSyncOverrideReload(hookId: TimeSync): () => void {
		return noOp;
	}
}
