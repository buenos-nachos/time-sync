import type { TimeSync } from "@buenos-nachos/time-sync";
import type { ReactTimeSyncGetter } from "./ReactTimeSync";

export type UseTimeSyncRef = () => TimeSync;

export function createUseTimeSyncRef(
	getter: ReactTimeSyncGetter,
): UseTimeSyncRef {
	return function useTimeSyncRef() {
		const reactTimeSync = getter();
		return reactTimeSync.getTimeSync();
	};
}
