import { TimeSync } from "@buenos-nachos/time-sync";
import { noOp } from "./utilities";

export type ReactTimeSyncGetter = () => ReactTimeSync;

export class ReactTimeSync {
	readonly #timeSync: TimeSync;

	constructor(timeSync?: TimeSync) {
		if (timeSync === undefined) {
			this.#timeSync = new TimeSync();
		} else {
			this.#timeSync = timeSync;
		}
	}

	getTimeSync(): TimeSync {
		return this.#timeSync;
	}

	onProviderMount(): () => void {
		return noOp;
	}

	onTimeSyncOverrideReload(timeSync: TimeSync): () => void {
		return noOp;
	}
}
