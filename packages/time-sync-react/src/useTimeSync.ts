import type { ReadonlyDate } from "@buenos-nachos/time-sync";
import React from "react";
import { useEffectEvent as polyfill } from "./hookPolyfills";
import type { ReactTimeSyncGetter } from "./ReactTimeSync";
import type { TransformCallback } from "./utilities";

const useEffectEvent: typeof polyfill =
	typeof React.useEffectEvent === "undefined" ? polyfill : React.useEffectEvent;

export type UseTimeSyncOptions<T> = Readonly<{
	/**
	 * The ideal interval of time, in milliseconds, that defines how often the
	 * hook should refresh with the newest state value from TimeSync.
	 *
	 * Note that a refresh is not the same as a re-render. If the hook is
	 * refreshed with a new datetime, but the state for the component itself has
	 * not changed, the hook will bail out of re-rendering.
	 *
	 * The hook reserves the right to refresh MORE frequently than the
	 * specified interval if it would guarantee that the hook does not get out
	 * of sync with other useTimeSync users. This removes the risk of screen
	 * tearing.
	 */
	targetIntervalMs: number;

	/**
	 * Allows you to transform any Date values received from the TimeSync
	 * class. If provided, the hook will return the result of calling the
	 * `transform` callback instead of the main Date state.
	 *
	 * `transform` works almost exactly like the `select` callback in React
	 * Query's `useQuery` hook. That is:
	 * 1. Inline functions are always re-run during re-renders to avoid stale
	 *    data issues.
	 * 2. `transform` does not use dependency arrays directly, but if it is
	 *    memoized via `useCallback`, it will only re-run during a re-render if
	 *    `useCallback` got invalidated or the date state changed.
	 * 3. When TimeSync dispatches a new date update, it will run the latest
	 *    `transform` callback. If the result has not changed (comparing by
	 *    value), the component will try to bail out of re-rendering. At that
	 *    stage, the component will only re-render if a parent component
	 *    re-renders
	 *
	 * `transform` callbacks must not be async. The hook will error out at the
	 * type level if you provide one by mistake.
	 */
	transform?: TransformCallback<T>;
}>;

// Even though this is a really simple function, keeping it defined outside
// useTimeSync helps with render performance, and helps stabilize a bunch
// of values in the hook when you're not doing transformations
function identity<T>(value: T): T {
	return value;
}

export function createUseTimeSync(getter: ReactTimeSyncGetter) {
	return function useTimeSync<T = ReadonlyDate>(
		options: UseTimeSyncOptions<T>,
	): T {
		const { transform } = options;
		const reactTimeSync = getter();
		const activeTransform = (transform ?? identity) as TransformCallback<T>;
	};
}

export type UseTimeSync = ReturnType<typeof createUseTimeSync>;
