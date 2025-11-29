/**
 * @file You might notice that this file is like 70% comments. Didn't want it to
 * be like that, but the file has to rely on so many hacks and advanced React
 * features that it's not going to be clear what's going on otherwise.
 */
import type { ReadonlyDate, TimeSync } from "@buenos-nachos/time-sync";
import React, {
	useCallback,
	useId,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useSyncExternalStore,
} from "react";
import { useEffectEventPolyfill } from "./hookPolyfills";
import type {
	ReactTimeSync,
	ReactTimeSyncGetter,
	SubscriptionData,
} from "./ReactTimeSync";
import { noOp, structuralMerge, type TransformCallback } from "./utilities";

export type UseTimeSyncRef = () => TimeSync;

export function createUseTimeSyncRef(
	getter: ReactTimeSyncGetter,
): UseTimeSyncRef {
	return function useTimeSyncRef() {
		const reactTs = getter();
		return reactTs.getTimeSync();
	};
}

const useEffectEvent: typeof React.useEffectEvent =
	typeof React.useEffectEvent === "undefined"
		? useEffectEventPolyfill
		: React.useEffectEvent;

export type UseTimeSyncOptions<T> = Readonly<{
	/**
	 * The ideal interval of time, in milliseconds, that defines how often the
	 * hook should refresh with the newest state value from TimeSync.
	 *
	 * Note that a refresh is not the same as a re-render. If the hook is
	 * refreshed with a new datetime, but the state for the component itself has
	 * not changed in a meaningful way, the hook will bail out of re-rendering.
	 *
	 * The hook reserves the right to refresh MORE frequently than the
	 * specified interval if it would guarantee that the hook does not get out
	 * of sync with other useTimeSync users. This removes the risk of screen
	 * tearing.
	 */
	targetRefreshIntervalMs: number;

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
	 */
	transform?: TransformCallback<T>;
}>;

// Even though this is a really simple function, keeping it defined outside
// useTimeSync helps with render performance, and helps stabilize a bunch
// of values in the hook when you're not doing transformations
function identity<T>(value: T): T {
	return value;
}

// Should also be defined outside the hook to optimize useReducer behavior
function negate(value: boolean): boolean {
	return !value;
}

// Using compiler directive to force this function to give us back a new
// function reference on every invocation. Only thing is that we needed to
// create a new function boundary to make this apply only to this operation
function createUnstableGetSub<T>(
	rts: ReactTimeSync,
	hookId: string,
): () => SubscriptionData<T> {
	"use no memo";
	return () => rts.getSubscriptionData<T>(hookId);
}

// The setup here is a little bit wonkier than the one for useTimeSyncRef
// because of type parameters. If we were to define the UseTimeSync type
// upfront, and then say that this function returns it, we would be forced to
// evaluate and consume the generic type slot. There's no way to reference a
// generic type in return type position without either passing it an explicit
// generic or triggering its default type. We have to avoid writing it out to
// trick TypeScript into preserving the slot, and then we can pluck the complete
// type out with the ReturnType utility type
export function createUseTimeSync(getter: ReactTimeSyncGetter) {
	return function useTimeSync<T = ReadonlyDate>(
		options: UseTimeSyncOptions<T>,
	): T {
		/**
		 * A lot of our challenges boil down to the fact that even though it's
		 * our only viable option right now, useSyncExternalStore is an
		 * incredibly wonky hook, and we have to hack our way around its edge
		 * cases. We REALLY have to bend over backwards to follow all the React
		 * rules (which is essential for making sure the React Compiler doesn't
		 * break anything if a user turns that on).
		 *
		 * 1. We HAVE to use the hook because it's the only officially-supported
		 *    way of grabbing a value from a mutable source right from the
		 *    mounting render. All other options involve breaking the React
		 *    rules, or introducing extra re-renders (and screen flickering).
		 * 2. It's also the only hook with native support for server rendering
		 *    and producing different values on server vs post-hydration client.
		 * 3. But to be on the safe side, if either callback for
		 *    useSyncExternalStore changes on re-render, React will re-call them
		 *    to be on the safe side. Not a huge deal for state getters, but it
		 *    does mean there's a risk that subscriptions can keep getting torn
		 *    down and built back up on re-renders. So we have to stabilize
		 *    those as much as possible.
		 * 4. We need to bring in a few layout effects to minimize the risks of
		 *    contradictory dates when a new component mounts, too, which
		 *    complicates using useSyncExternalStore.
		 * 5. This isn't documented anywhere, but the way the hook works is that
		 *    on mount, it grabs the value from the mutable source via the
		 *    getter function, and then waits until after the render finishes to
		 *    fire the subscription callback. In other words, the subscription
		 *    gets registered at useEffect speed. That opens it up to screen
		 *    flickering problems, and also means that by default, it's
		 *    impossible to "weave" it between useLayoutEffect calls because
		 *    they'll always outpace it.
		 * 6. So, basically we have to do some cursed things to build out an
		 *    equivalent version of useSyncExternalStore that has two extra
		 *    features:
		 *    1. Being able to subscribe at useLayoutEffect speed.
		 *    2. Being able to call any number of hooks between the get and
		 *       subscribe phases, instead of keeping them glued together.
		 *
		 * There's still the problem of useSyncExternalStore not having any
		 * support for React's concurrency features whatsoever, and it sometimes
		 * undoing performance optimizations from concurrent rendering. But
		 * that's a problem that can't be solved until React comes out with
		 * concurrent stores. All the state management libraries in the entire
		 * ecosystem have to put up with this edge case right now, too.
		 */
		const { targetRefreshIntervalMs, transform } = options;
		const activeTransform = (transform ?? identity) as TransformCallback<T>;
		const rts = getter();

		// This is an abuse of the useId API, but because it gives us a stable
		// ID that is uniquely associated with the current component instance,
		// we can use it to differentiate between multiple instances of the same
		// function component subscribing to useTimeSync. Technically it also
		// differentiates between different useTimeSync calls in the same
		// component instance, too
		const hookId = useId();

		// The notifyReact callback is what React uses to decide when to re-call
		// the state getter while outside a render. We have to eject this
		// function specifically; trying to force re-rendering via a simple
		// useReducer hack won't work. Not only will it lack the necessary level
		// of granularity, but it's not guaranteed the getter will re-run. Also,
		// we MUST make sure that useRef is initialized with a function that we
		// both own and that is defined outside the render so that we can do
		// simple comparisons to see if the real callback has been loaded yet
		const ejectedNotifyRef = useRef(noOp);
		const stableDummySubscribe = useCallback((notifyReact: () => void) => {
			ejectedNotifyRef.current = notifyReact;
			return noOp;
		}, []);

		/**
		 * This is a wacky setup, but because we sometimes call subscribers from
		 * useLayoutEffects, we need to account for this scenario, and make it
		 * impossible:
		 *
		 * 1. We call useSyncExternalStore, get the value from the mutable
		 *    source immediately, and then cue up the logic for ejecting the
		 *    notify callback at useEffect speed
		 * 2. The layout effect for the subscription fires, and it gets set up.
		 * 3. Some other layout effect fires, and causes the susbcribers to be
		 *    notified
		 * 4. But because we haven't had the chance to eject anything yet, we
		 *    don't have the ability to tell the newly-added state getter to
		 *    check for a new value. And then we're back to screen tearing.
		 *
		 * The solution is to force a coarse-grained re-render (useState also
		 * works, but useReducer gives us more options for minimizing GC
		 * generation on each render). And then deliberately keep the state
		 * getter UN-memoized. React will automatically re-call the getter on
		 * the new render because it'll receive a new function reference, and if
		 * the value happened to change, we'll still have access to it.
		 *
		 * We have to do a little more work to prevent the React Compiler from
		 * memoizing the callback when it shouldn't, but that's it.
		 */
		const [, fallbackSync] = useReducer(negate, false);
		const unstableGetSub = createUnstableGetSub<T>(rts, hookId);
		const { date, cachedTransformation } = useSyncExternalStore(
			stableDummySubscribe,
			unstableGetSub,
		);

		// There's some trade-offs with this memo (notably, if the consumer
		// passes in an inline transform callback, the memo result will be
		// invalidated on every single render). But it's the *only* way to give
		// the consumer the option of memoizing expensive transformations at the
		// render level without polluting the hook's API with super-fragile
		// dependency array logic
		const renderTransformation = useMemo(
			() => activeTransform(date),
			[date, activeTransform],
		);

		const merged = useMemo(() => {
			const prev = cachedTransformation ?? renderTransformation;
			return structuralMerge(prev, renderTransformation);
		}, [cachedTransformation, renderTransformation]);

		const stableSubscribe = useEffectEvent((targetMs: number) => {
			const unsub = rts.subscribe({
				hookId,
				initialValue: merged,
				targetRefreshIntervalMs: targetMs,
				transform: activeTransform,
				onReactStateSync: () => {
					if (ejectedNotifyRef.current === noOp) {
						fallbackSync();
					} else {
						ejectedNotifyRef.current();
					}
				},
			});
			return unsub;
		});
		useLayoutEffect(() => {
			return stableSubscribe(targetRefreshIntervalMs);
		}, [stableSubscribe, targetRefreshIntervalMs]);

		useLayoutEffect(() => {
			rts.syncTransformation(hookId, merged);
		}, [rts, hookId, merged]);

		useLayoutEffect(() => {
			rts.onComponentMount();
		}, [rts]);

		return merged;
	};
}

export type UseTimeSync = ReturnType<typeof createUseTimeSync>;
