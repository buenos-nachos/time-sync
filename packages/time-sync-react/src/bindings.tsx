import type { TimeSync } from "@buenos-nachos/time-sync";
import {
	createContext,
	type FC,
	type ReactNode,
	useContext,
	useInsertionEffect,
	useState,
} from "react";
import { ReactTimeSync, type ReactTimeSyncGetter } from "./ReactTimeSync";
import { createUseTimeSync, type UseTimeSync } from "./useTimeSync";
import { createUseTimeSyncRef, type UseTimeSyncRef } from "./useTimeSyncRef";

export type TimeSyncProvider = FC<{
	children: ReactNode;
	timeSyncOverride?: TimeSync;
}>;

const injectionTypes = [
	"closure",
	"reactContext",
	"hybrid",
] as const satisfies readonly string[];

export type InjectionType = (typeof injectionTypes)[number];

function isInjectionType(value: unknown): value is InjectionType {
	return injectionTypes.includes(value as InjectionType);
}

export type CreateReactBindingsOptions<T extends InjectionType> =
	T extends "reactContext"
		? {
				readonly injectionType: T;
			}
		: {
				readonly injectionType: T;
				readonly timeSync: TimeSync;
			};

export type CreateReactBindingsResult<T extends InjectionType> =
	T extends "closure"
		? {
				readonly useTimeSync: unknown;
				readonly useTimeSyncRef: UseTimeSyncRef;
			}
		: {
				readonly useTimeSync: UseTimeSync;
				readonly useTimeSyncRef: UseTimeSyncRef;
				readonly TimeSyncProvider: TimeSyncProvider;
			};

// Making flattened, "non-clever" version of the above types so that they're
// easier to work with internally. The main problem with them is that they don't
// provide any nice TypeScript type feedback for external users
interface FlatCreateReactBindingsOptions {
	readonly injectionType: InjectionType;
	readonly timeSync?: TimeSync;
}
interface FlatCreateReactBindingsResult {
	readonly useTimeSync: unknown;
	readonly useTimeSyncRef: UseTimeSyncRef;
	TimeSyncProvider?: TimeSyncProvider;
}

function validateCreateReactBindingsOptions(
	options: FlatCreateReactBindingsOptions,
): void {
	const { injectionType, timeSync } = options;

	if (!isInjectionType(injectionType)) {
		throw new RangeError(`Received unknown injection type: ${injectionType}`);
	}

	const missingFallbackSync =
		(injectionType === "closure" || injectionType === "hybrid") &&
		timeSync === undefined;
	if (missingFallbackSync) {
		throw new Error(
			`timeSync property is missing for ${injectionType} strategy`,
		);
	}
}

export function createReactBindings<T extends InjectionType>(
	options: CreateReactBindingsOptions<T>,
): CreateReactBindingsResult<T> {
	const flat = options as FlatCreateReactBindingsOptions;
	validateCreateReactBindingsOptions(flat);
	const { injectionType, timeSync } = flat;

	// Not trying to DRY these cases up because realistically, these are going
	// to get more complicated and nuanced over time. Code duplication is better
	// than bad abstractions right now
	let TimeSyncProvider: TimeSyncProvider | undefined;
	let getter: ReactTimeSyncGetter;
	switch (injectionType) {
		case "closure": {
			const fixedRts = new ReactTimeSync(timeSync);
			getter = () => fixedRts;
			TimeSyncProvider = undefined;
			break;
		}

		case "reactContext": {
			const rtsContext = createContext<ReactTimeSync | null>(null);

			getter = function useReactTimeSyncContext() {
				const value = useContext(rtsContext);
				if (value === null) {
					throw new Error(
						"Bindings were created with setting `reactContext`, but TimeSyncProvider is not mounted anywhere in the application",
					);
				}
				return value;
			};

			TimeSyncProvider = ({ children }) => {
				const [rts] = useState(() => new ReactTimeSync(timeSync));
				useInsertionEffect(() => {
					return rts.onProviderMount();
				}, [rts]);
				return (
					<rtsContext.Provider value={rts}>{children}</rtsContext.Provider>
				);
			};
			break;
		}

		case "hybrid": {
			const fixedRts = new ReactTimeSync(timeSync);
			const rtsContext = createContext(fixedRts);
			const useReactTimeSyncContextWithoutTree = () => useContext(rtsContext);

			getter = useReactTimeSyncContextWithoutTree;

			TimeSyncProvider = ({ children, timeSyncOverride }) => {
				const rts = useReactTimeSyncContextWithoutTree();

				useInsertionEffect(() => {
					if (!timeSyncOverride) {
						return undefined;
					}
					return rts.onTimeSyncOverrideReload(timeSyncOverride);
				}, [rts, timeSyncOverride]);

				useInsertionEffect(() => {
					return rts.onProviderMount();
				}, [rts]);

				return (
					<rtsContext.Provider value={rts}>{children}</rtsContext.Provider>
				);
			};

			break;
		}

		default: {
			const exhaust: never = injectionType;
			throw new Error(
				`Impossible case encountered: cannot process injection type ${exhaust}`,
			);
		}
	}

	const result: FlatCreateReactBindingsResult = {
		useTimeSync: createUseTimeSync(getter),
		useTimeSyncRef: createUseTimeSyncRef(getter),
	};
	// Only add the key at runtime if we actually have a meaningful value
	if (TimeSyncProvider !== undefined) {
		result.TimeSyncProvider = TimeSyncProvider;
	}
	return result as CreateReactBindingsResult<T>;
}
