/**
 * @file When updating the comments for the useTimeSync and useTimeSyncRef
 * hooks, be sure to copy them to hooks.ts as well.
 */
import type { ReadonlyDate, TimeSync } from "@buenos-nachos/time-sync";
import {
	type Context,
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
	type UseTimeSyncOptions,
	type UseTimeSyncRef,
	type UseTimeSyncResult,
} from "./hooks";
import { ReactTimeSync, type ReactTimeSyncGetter } from "./ReactTimeSync";

/**
 * @todo Need to figure out the best way to describe this
 */
export type TimeSyncProvider = FC<{
	children: ReactNode;
	timeSync?: TimeSync;
}>;

function createTimeSyncProvider(
	context: Context<ReactTimeSync> | Context<ReactTimeSync | undefined>,
): TimeSyncProvider {
	return ({ children, timeSync }) => {
		const [lockedRts] = useState(() => new ReactTimeSync(timeSync));
		useInsertionEffect(() => {
			return lockedRts.initialize();
		}, [lockedRts]);

		return <context.Provider value={lockedRts}>{children}</context.Provider>;
	};
}

const injectionMethods = [
	"closure",
	"reactContext",
	"hybrid",
] as const satisfies readonly string[];

/**
 * @todo Need to figure out the best way to describe this
 */
export type InjectionMethod = (typeof injectionMethods)[number];

function isInjectionMethod(value: unknown): value is InjectionMethod {
	return injectionMethods.includes(value as InjectionMethod);
}

type CreateReactBindingsOptions<
	T extends InjectionMethod,
	U extends boolean,
> = T extends "reactContext"
	? {
			readonly injectionMethod: T;
			readonly isServerRendered: U;
		}
	: {
			readonly injectionMethod: T;
			readonly isServerRendered: U;
			readonly timeSync: TimeSync;
		};

// TypeScript's LSP ensures that even if we only add comments to one property
// in the union, the info will still be copied to any properties with the same
// name in other union members
type CreateReactBindingsResult<
	TInject extends InjectionMethod,
	TIsServerRendered extends boolean,
> = TInject extends "closure"
	? {
			readonly useTimeSyncRef: UseTimeSyncRef;
			readonly useTimeSync: <TData = ReadonlyDate>(
				options: UseTimeSyncOptions<TData>,
			) => UseTimeSyncResult<TIsServerRendered, TData>;
		}
	: {
			/**
			 * Sets up a new TimeSync subscription using the specified
			 * interval, and ensures that the component will be able to
			 * re-render as the TimeSync instance updates its internal state
			 * and notifies subscribers.
			 *
			 * The returned value is fully bound to React's lifecycles, and is
			 * always safe to reference inside render logic, event handlers, and
			 * effects.
			 *
			 * See the `UseTimeSyncOptions` type for more info on what each
			 * property does.
			 */
			readonly useTimeSync: <TData = ReadonlyDate>(
				options: UseTimeSyncOptions<TData>,
			) => UseTimeSyncResult<TIsServerRendered, TData>;

			/**
			 * Exposes the raw TimeSync instance without binding it to React
			 * state. The TimeSync itself is safe to pass around inside a
			 * render, but ALL of its methods must be called from inside event
			 * handlers or useEffect calls.
			 *
			 * This hook is mainly intended as an escape hatch for when
			 * `useTimeSync` won't serve your needs.
			 */
			readonly useTimeSyncRef: UseTimeSyncRef;

			/**
			 * @todo Need to figure out the best way to describe this
			 */
			readonly TimeSyncProvider: TimeSyncProvider;
		};

// Making flattened, "non-clever" version of the above types so that they're
// easier to work with internally. The main problem with them is that they don't
// provide any nice TypeScript type feedback for external users
interface FlatCreateReactBindingsOptions {
	readonly injectionMethod: InjectionMethod;
	readonly isServerRendered: boolean;
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

// The goal of this function is basically to wire up all the individual helpers
// while providing nice, polished TypeScript types for good developer experience
export function createReactBindings<
	TInject extends InjectionMethod,
	TIsServerRendered extends boolean,
>(
	options: CreateReactBindingsOptions<TInject, TIsServerRendered>,
): CreateReactBindingsResult<TInject, TIsServerRendered> {
	const flat = options as FlatCreateReactBindingsOptions;
	validateCreateReactBindingsOptions(flat);
	const { injectionMethod, timeSync } = flat;

	// Not trying to DRY these cases up because realistically, these are going
	// to get more complicated and nuanced over time. Code duplication is better
	// than bad abstractions right now
	let TimeSyncProvider: TimeSyncProvider | undefined;
	let get: ReactTimeSyncGetter;
	switch (injectionMethod) {
		case "closure": {
			const fixedRts = new ReactTimeSync(timeSync);
			get = () => fixedRts;
			TimeSyncProvider = undefined;
			fixedRts.initialize();
			break;
		}

		case "reactContext": {
			const context = createContext<ReactTimeSync | undefined>(undefined);
			get = function useReactTimeSyncContext() {
				const value = useContext(context);
				if (value === undefined) {
					throw new Error(
						"Bindings were created with injection method `reactContext`, but TimeSyncProvider is not mounted anywhere in the application",
					);
				}
				return value;
			};
			TimeSyncProvider = createTimeSyncProvider(context);
			break;
		}

		case "hybrid": {
			// This behavior is almost never used by React developers, but even if
			// useContext is called outside of a complete UI tree (which you have to
			// worry about with Astro's islands), the call will still work as long as
			// there's a meaningful default value
			const defaultRts = new ReactTimeSync(timeSync);
			const context = createContext(defaultRts);
			get = function useReactTimeSyncContextWithDefault() {
				return useContext(context);
			};
			TimeSyncProvider = createTimeSyncProvider(context);
			defaultRts.initialize();
			break;
		}

		default: {
			const exhaustCheck: never = injectionMethod;
			throw new RangeError(
				`Impossible case encountered: cannot process injection method ${exhaustCheck}`,
			);
		}
	}

	const result: FlatCreateReactBindingsResult = {
		useTimeSync: createUseTimeSync<TIsServerRendered>(get),
		useTimeSyncRef: createUseTimeSyncRef(get),
	};
	// Only add the key at runtime if we actually have a meaningful value
	if (TimeSyncProvider !== undefined) {
		result.TimeSyncProvider = TimeSyncProvider;
	}
	return result as CreateReactBindingsResult<TInject, TIsServerRendered>;
}
