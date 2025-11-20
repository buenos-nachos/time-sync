import React, {
	useCallback,
	useId,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useSyncExternalStore,
} from "react";
import type { ReadonlyDate } from "../../time-sync/src";
import { noOp, structuralMerge, type TransformCallback } from "./general";
import type { TimeSyncWithoutDispose } from "./ReactTimeSync";
import { useReactTimeSync } from "./TimeSyncProvider";
import { useEffectEvent as polyfill } from "./useEffectEventPolyfill";

const useEffectEvent: typeof polyfill =
	// @ts-expect-error -- Because we need to support React versions 18+,
	// there's not a great way to define useEffectEvent in the namespace without
	// it creeping into userland. Either we say it always exists, which breaks
	// React 18 through 19.1, or we say it optionally exists, which adds
	// unnecessary null checks to React 19.2+
	typeof React.useEffectEvent === "undefined" ? polyfill : React.useEffectEvent;

/**
 * Provides direct access to the TimeSync instance being dependency-injected
 * throughout the React application. It functions as ref state – most of its
 * methods are NOT safe to access during renders, and only from within effects
 * (whether that's some version of useEffect, or an event handler).
 *
 * If you need to bind React state updates to TimeSync, consider using
 * `useTimeSync` instead, which handles all render-safety concerns for you
 * automatically.
 */
export function useTimeSyncRef(): TimeSyncWithoutDispose {
	const reactTs = useReactTimeSync();
	return reactTs.getTimeSyncWithoutDispose();
}

// Even though this is a really simple function, keeping it defined outside
// useTimeSync helps with render performance, and helps stabilize a bunch
// of values in the hook when you're not doing transformations
function identity<T>(value: T): T {
	return value;
}

type ReactSubscriptionCallback = (notifyReact: () => void) => () => void;

type UseTimeSyncOptions<T> = Readonly<{
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

/**
 * Lets you bind your React component's state to a TimeSync's time subscription
 * logic.
 *
 * When the hook is called for the first time, the date state it works with is
 * guaranteed to be within one second of the current time, not the date state
 * that was used for the last notification (if any happened at all).
 *
 * Note that any component mounted with this hook will re-render under two
 * situations:
 * 1. A state update was dispatched via the TimeSync's normal time update logic.
 * 2. If a component was mounted for the first time with a fresh date, all other
 *    components will be "refreshed" to use the same date as well. This is to
 *    avoid stale date issues, and will happen even if all other subscribers
 *    were subscribed with an interval of positive infinity.
 */
export function useTimeSync<T = ReadonlyDate>(
	options: UseTimeSyncOptions<T>,
): T {
	const { targetIntervalMs, transform } = options;
	const activeTransform = (transform ?? identity) as TransformCallback<T>;

	// This is an abuse of the useId API, but because it gives us an ID that is
	// uniquely associated with the current component instance, we can use it to
	// differentiate between multiple instances of the same function component
	// subscribing to useTimeSync
	const hookId = useId();
	const reactTs = useReactTimeSync();

	// getSnap should be 100% stable for the entire component lifetime to
	// minimize unnecessary function calls for useSyncExternalStore. Note that
	// because of how React lifecycles work, getSnap will always return the
	// TimeSync's current Date object on the mounting render (without ever
	// applying any transformations). This is expected, and the rest of the hook
	// logic ensures that it will be intercepted before being returned to
	// consumers
	const getSnap = useCallback(
		() => reactTs.getComponentSnapshot<T>(hookId),
		[reactTs, hookId],
	);

	// Because of how React lifecycles work, this effect event callback should
	// never be called from inside render logic. While called in a re-render, it
	// will *always* give you stale date, but it will be correct by the time
	// the external system needs to use the function
	const externalTransform = useEffectEvent(activeTransform);

	// This is a hack to deal with some of the timing issues when dealing with
	// useSyncExternalStore. The subscription logic fires at useEffect priority,
	// which (1) is too slow since we have layout effects, and (2) even if the
	// subscription fired at layout effect speed, we actually need to delay when
	// it gets set up so that other layout effects can fire first. This is
	// *very* wacky, but satisfies all the React rules, and avoids a bunch of
	// chicken-and-the-egg problems when dealing with React lifecycles and state
	// sometimes not being defined
	const ejectedNotifyRef = useRef<() => void>(noOp);
	const subscribeWithEjection = useCallback<ReactSubscriptionCallback>(
		(notifyReact) => {
			ejectedNotifyRef.current = notifyReact;
			return noOp;
		},
		[],
	);

	/**
	 * Important bits of context that the React docs don't cover:
	 *
	 * useSyncExternalStore has two distinct phases when it mounts:
	 * 1. The state getter runs first in the render itself, and is called twice
	 *    to guarantee that the snapshot is stable.
	 * 2. Once the render completes, the subscription fires at useEffect
	 *    priority (meaning that layout effects can out-race it)
	 *
	 * Also, both functions will re-run every time their function references
	 * change, which is why both callbacks are memoized. We don't want
	 * subscriptions torn down and rebuilt each render.
	 */
	const cachedTransformation = useSyncExternalStore(
		subscribeWithEjection,
		getSnap,
	);

	/**
	 * @todo Figure out if I could actually update the definition for
	 * getComponentSnapshot to put the date value on the snapshot itself, but
	 * just don't notify React when the state changes
	 */
	const todo = void "I dunno, try it";

	// There's some trade-offs with this memo (notably, if the consumer passes
	// in an inline transform callback, the memo result will be invalidated on
	// every single render). But it's the *only* way to give the consumer the
	// option of memoizing expensive transformations at the render level without
	// polluting the hook's API with super-fragile dependency array logic
	const newTransformation = useMemo(() => {
		// Since this function is used to break the React rules slightly, we
		// need to opt this function out of being compiled by the React Compiler
		// to make sure it doesn't compile the function the wrong way
		"use no memo";

		// This state getter is technically breaking the React rules, because
		// we're getting a mutable value while in a render without binding it to
		// state. But it's "pure enough", and the useSyncExternalStore logic for
		// the transformation snapshots ensures that things won't actually get
		// out of sync. We can't subscribe to the date itself, because then we
		// lose the ability to re-render only on changed transformations
		const latestDate = reactTs.getDateSnapshot();
		return activeTransform(latestDate);
	}, [reactTs, activeTransform]);

	// Making sure to merge the results so that the hook interfaces well with
	// memoization and effects outside of this hook
	const merged = useMemo(
		() => structuralMerge(cachedTransformation, newTransformation),
		[cachedTransformation, newTransformation],
	);

	// Because this is a layout effect, it's guaranteed to fire before the
	// subscription logic, even though the subscription was registered first.
	// This lets us cut back on redoing computations that were already handled
	// in the render
	useLayoutEffect(() => {
		reactTs.updateComponentState(hookId, merged);
	}, [reactTs, hookId, merged]);

	// For correctness, because the hook notifies all subscribers of a potential
	// state change on mount, we need to make sure that the subscription gets
	// set up with a working state setter callback. This can be used until the
	// low-priority useSyncExternalStore subscription fires. If all goes well,
	// it shouldn't ever be needed, but this truly ensures that the various
	// systems can't get out of sync with each other. We only use this on the
	// mounting render because the notifyReact callback is better in all ways.
	// It's much more fine-grained and is actively associated with the state
	// lifecycles for the useSyncExternalStore hook
	const [, fallbackStateSync] = useReducer(
		(dummyForceRerenderState) => !dummyForceRerenderState,
		false,
	);

	// There's a lot of dependencies here, but the only cue for invalidating the
	// subscription should be the target interval changing
	useLayoutEffect(() => {
		return reactTs.subscribe({
			componentId: hookId,
			targetRefreshIntervalMs: targetIntervalMs,
			transform: externalTransform,
			onReactStateSync: () => {
				if (ejectedNotifyRef.current === noOp) {
					fallbackStateSync();
				} else {
					ejectedNotifyRef.current();
				}
			},
		});
	}, [reactTs, hookId, externalTransform, targetIntervalMs]);

	// This is the one case where we're using useLayoutEffect for its intended
	// purpose, but it's also the reason why we have to worry about effect
	// firing speed. Because the mounting logic is able to trigger state
	// updates, we need to fire them before paint to make sure that we don't get
	// screen flickering
	useLayoutEffect(() => {
		reactTs.syncAllSubscribersOnMount();
	}, [reactTs]);

	return merged;
}
