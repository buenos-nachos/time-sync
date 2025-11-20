import {
	createContext,
	type FC,
	type ReactNode,
	useContext,
	useInsertionEffect,
	useState,
} from "react";
import type { InitialDate } from "./general";
import { ReactTimeSync } from "./ReactTimeSync";

const reactTimeSyncContext = createContext<ReactTimeSync | null>(null);

/**
 * Exposes the raw ReactTimeSync for use by internal hooks. This hook should
 * NEVER be exported to the end user; it is strictly an implementation detail.
 */
export function useReactTimeSync(): ReactTimeSync {
	const reactTs = useContext(reactTimeSyncContext);
	if (reactTs === null) {
		throw new Error(
			`Must call TimeSync hook from inside ${TimeSyncProvider.name}`,
		);
	}
	return reactTs;
}

export type TimeSyncProviderProps = Readonly<{
	initialDate?: InitialDate;
	freezeUpdates?: boolean;
	children?: ReactNode;
}>;

export const TimeSyncProvider: FC<TimeSyncProviderProps> = ({
	children,
	initialDate,
	freezeUpdates = false,
}) => {
	const [readonlyReactTs] = useState(() => {
		return new ReactTimeSync({ initialDate, freezeUpdates });
	});

	// This is a super, super niche use case, but we need to ensure the effect
	// for setting up the provider mounts before the effects in the individual
	// hook consumers. Because the hooks use useLayoutEffect, which already has
	// higher priority than useEffect, and because effects always fire from the
	// bottom up in the UI tree, the only option is to use the one effect type
	// that has faster firing priority than useLayoutEffect
	useInsertionEffect(() => {
		return readonlyReactTs.onProviderMount();
	}, [readonlyReactTs]);

	return (
		<reactTimeSyncContext.Provider value={readonlyReactTs}>
			{children}
		</reactTimeSyncContext.Provider>
	);
};
