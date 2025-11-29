import type { TimeSync } from "@buenos-nachos/time-sync";
import {
	createContext,
	type FC,
	type ReactNode,
	useContext,
	useInsertionEffect,
	useState,
} from "react";
import {
	createUseTimeSync,
	createUseTimeSyncRef,
	type UseTimeSync,
	type UseTimeSyncRef,
} from "./hooks";
import { ReactTimeSync, type ReactTimeSyncGetter } from "./ReactTimeSync";

export type TimeSyncProvider = FC<{
	children: ReactNode;
	timeSync?: TimeSync;
}>;

const injectionMethods = [
	"closure",
	"reactContext",
	"hybrid",
] as const satisfies readonly string[];

type InjectionMethod = (typeof injectionMethods)[number];

function isInjectionMethod(value: unknown): value is InjectionMethod {
	return injectionMethods.includes(value as InjectionMethod);
}

type CreateReactBindingsOptions<T extends InjectionMethod> =
	T extends "reactContext"
		? {
				readonly injectionMethod: T;
			}
		: {
				readonly injectionMethod: T;
				readonly timeSync: TimeSync;
			};

type CreateReactBindingsResult<T extends InjectionMethod> = T extends "closure"
	? {
			readonly useTimeSync: UseTimeSync;
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
	readonly injectionMethod: InjectionMethod;
	readonly timeSync?: TimeSync;
}
interface FlatCreateReactBindingsResult {
	readonly useTimeSync: unknown;
	readonly useTimeSyncRef: UseTimeSyncRef;
	// Left mutable on purpose; it'll become readonly before it reaches users
	TimeSyncProvider?: TimeSyncProvider;
}

function validateCreateReactBindingsOptions(
	options: FlatCreateReactBindingsOptions,
): void {
	const { injectionMethod, timeSync } = options;

	if (!isInjectionMethod(injectionMethod)) {
		throw new RangeError(
			`Received unknown injection method: ${injectionMethod}`,
		);
	}

	const missingFallbackSync =
		(injectionMethod === "closure" || injectionMethod === "hybrid") &&
		timeSync === undefined;
	if (missingFallbackSync) {
		throw new Error(
			`timeSync property is missing for ${injectionMethod} strategy`,
		);
	}
}

export function createReactBindings<T extends InjectionMethod>(
	options: CreateReactBindingsOptions<T>,
): CreateReactBindingsResult<T> {
	const flat = options as FlatCreateReactBindingsOptions;
	validateCreateReactBindingsOptions(flat);
	const { injectionMethod, timeSync } = flat;

	// Not trying to DRY these cases up because realistically, these are going
	// to get more complicated and nuanced over time. Code duplication is better
	// than bad abstractions right now
	let TimeSyncProvider: TimeSyncProvider | undefined;
	let getter: ReactTimeSyncGetter;
	switch (injectionMethod) {
		case "closure": {
			const fixedRts = new ReactTimeSync(timeSync);
			getter = () => fixedRts;
			TimeSyncProvider = undefined;
			break;
		}

		case "reactContext": {
			const rtxForProvider = new ReactTimeSync();
			const rtsContext = createContext<ReactTimeSync | null>(null);

			// Even though we can embed the ReactTimeSync via closure and have
			// it still work at runtime, we want to define things this way to
			// FORCE the user to go through context and make the API more
			// predictable compared to other context-based libraries
			getter = function useReactTimeSyncContext() {
				const value = useContext(rtsContext);
				if (value === null) {
					throw new Error(
						"Bindings were created with injection method `reactContext`, but TimeSyncProvider is not mounted anywhere in the application",
					);
				}
				return value;
			};

			// The two TimeSyncProviders look suspiciously the same, and they
			// actually are right now (with one involving slightly more hoops),
			// but if we ever provide a way to configure the ReactTimeSync
			// separately from the vanilla TimeSync (even if indirectly), we
			// want to keep these paths separate
			TimeSyncProvider = ({ children, timeSync }) => {
				const [lockedTimeSyncOverride] = useState(timeSync);
				useInsertionEffect(() => {
					return rtxForProvider.onProviderMount(lockedTimeSyncOverride);
				}, [lockedTimeSyncOverride]);
				return (
					<rtsContext.Provider value={rtxForProvider}>
						{children}
					</rtsContext.Provider>
				);
			};
			break;
		}

		case "hybrid": {
			const defaultRts = new ReactTimeSync(timeSync);

			// This behavior is almost never used by React developers, but even
			// if useContext is called outside of a complete UI tree (which you
			// have to worry about with Astro's islands), the call will still
			// work as long as there's a meaningful default value
			const rtsContext = createContext(defaultRts);
			getter = () => useContext(rtsContext);

			TimeSyncProvider = ({ children, timeSync }) => {
				const [lockedRtsOverride] = useState(() => new ReactTimeSync(timeSync));
				useInsertionEffect(() => {
					return lockedRtsOverride.onProviderMount();
				}, [lockedRtsOverride]);
				return (
					<rtsContext.Provider value={lockedRtsOverride}>
						{children}
					</rtsContext.Provider>
				);
			};

			break;
		}

		default: {
			const exhaust: never = injectionMethod;
			throw new Error(
				`Impossible case encountered: cannot process injection method ${exhaust}`,
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
