/**
 * @file You might notice that this file is like 70% comments. Didn't want it to
 * be like that, but the file has to rely on so many hacks, undocumented (but
 * stable) behavior, and advanced React features that it's not going to be clear
 * what's going on otherwise.
 *
 * Also, because of how we generate the hooks for the end-consumer, we have to
 * duplicate the comments for the hooks and the properties in bindings.tsx.
 * Otherwise, the info will be erased when the user calls createReactBindings
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
import type { SubscriptionData, UseReactTimeSync } from "./ReactTimeSync";
import { noOp, structuralMerge, type TransformCallback } from "./utilities";

// Copied from bindings.tsx
/**
 * Exposes the raw TimeSync instance without binding it to React
 * state. The TimeSync itself is safe to pass around inside a
 * render, but ALL of its methods must be called from inside event
 * handlers or useEffect calls.
 *
 * This hook is mainly intended as an escape hatch for when
 * `useTimeSync` won't serve your needs.
 */
export type UseTimeSyncRef = () => TimeSync;

export function createUseTimeSyncRef(useRts: UseReactTimeSync): UseTimeSyncRef {
	return function useTimeSyncRef() {
		const rts = useRts();
		return rts.getTimeSync();
	};
}

const useEffectEvent: typeof React.useEffectEvent =
	typeof React.useEffectEvent === "undefined"
		? useEffectEventPolyfill
		: React.useEffectEvent;

/**
 * Dates are notoriously hard to send over the wire in React Server Rendering
 * because there's a very high chance that you'll have a hydration mismatch
 * error from the differences in the server's time and the user's local time.
 *
 * What we'll do is always use a null value for all properties on the server
 * render and initial hydration, and then immediately invalidate the data once
 * the state initializes on the client's device.
 */
type DummyValueForServerRendering = {
	readonly [k in keyof SubscriptionData<unknown>]: null;
};
const dummy: DummyValueForServerRendering = {
	date: null,
	cachedTransformation: null,
};
function getServerValue(): DummyValueForServerRendering {
	return dummy;
}

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

/**
 * @todo Need to figure out the best way to describe this
 */
export interface UseTimeSyncOptions<T> {
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
}

export type UseTimeSyncResult<
	TIsServerRendered extends boolean,
	TReturn,
> = TIsServerRendered extends true ? TReturn | null : TReturn;

// The setup here is a little bit wonkier than the one for useTimeSyncRef
// because of type parameters. Have to jump through so many hoops to avoid
// writing out the type name in certain positions so that we can preserve the
// type parameter slots. Turns out, one of TypeScript's biggest limitations is
// that you can't reference generic types by name without consuming the slot or
// triggering a default parameter, and the only way to avoid that is by making
// hacks out of function boundaries.
export type UseTimeSync<
	TIsServerRendered extends boolean,
	TData = ReadonlyDate,
> = (
	options: UseTimeSyncOptions<TData>,
) => UseTimeSyncResult<TIsServerRendered, TData>;

// Can't add explicit return type here because then we'd consume the data type
// parameter slot. Have to defer to the inner function's slot.
export function createUseTimeSync<const TIsServerRendered extends boolean>(
	useRts: UseReactTimeSync,
) {
	function useTimeSync<T = ReadonlyDate>(
		options: UseTimeSyncOptions<T>,
	): UseTimeSyncResult<TIsServerRendered, T> {
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
		 * 4. This isn't documented anywhere, but the way the hook works is that
		 *    on mount, it grabs the value from the mutable source via the
		 *    getter function, and then waits until after the render finishes to
		 *    fire the subscription callback. In other words, the subscription
		 *    gets registered at useEffect speed. That opens it up to screen
		 *    flickering problems, and also means that by default, it's
		 *    impossible to "weave" it between useLayoutEffect calls because
		 *    they'll always outpace it.
		 * 5. We need to bring in a few layout effects to minimize the risks of
		 *    contradictory dates when a new component mounts, too, so we
		 *    suddenly have to start worrying about firing priority and React
		 *    lifecycles (without being able to interface with them directly,
		 *    because we're not using class components).
		 * 6. So, basically we have to do some cursed things to build out an
		 *    equivalent version of useSyncExternalStore that has two extra
		 *    features:
		 *    1. Being able to subscribe at useLayoutEffect speed (or at least
		 *       pretend that it can).
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
		const rts = useRts();

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
		 * 3. Some other layout effect fires, and causes all subscribers to be
		 *    notified
		 * 4. We'll have the subscription already, so the new component will be
		 *    part of the update process. But we won't have had the chance to
		 *    eject the notification callback yet, so we won't be able to
		 *    guarantee the consumer correctly updates and avoids screen tearing
		 *
		 * The solution is to set up extra state to force a coarse-grained
		 * re-render with a dummy value, and use that dummy value to invalidate
		 * the state getter. React will automatically re-call the getter on
		 * the new render because it'll receive a new function reference, and if
		 * the get result happened to change, we'll be guaranteed to grab it.
		 */
		const [depArrayInvalidator, fallbackSync] = useReducer(negate, false);
		const getSubWithInvalidation = useCallback(() => {
			// Literally just doing this to make the linter happy that we're
			// including an otherwise unused value in the dependency array. The
			// big worry is that if this value isn't referenced in the function
			// whatsoever, the React Compiler will optimize the function the
			// wrong way and cause bugs.
			void depArrayInvalidator;
			return rts.getSubscriptionData<T>(hookId);
		}, [rts, hookId, depArrayInvalidator]);

		const { date, cachedTransformation } = useSyncExternalStore<
			SubscriptionData<T | null> | DummyValueForServerRendering
		>(stableDummySubscribe, getSubWithInvalidation, getServerValue);

		// There's some trade-offs with this memo (notably, if the consumer
		// passes in an inline transform callback, the memo result will be
		// invalidated on every single render). But it's the *only* way to give
		// the consumer the option of memoizing expensive transformations at the
		// render level without polluting the hook's API with super-fragile
		// dependency array logic
		const newTransformation = useMemo(() => {
			if (date === null) {
				return null;
			}
			return activeTransform(date);
		}, [date, activeTransform]);

		const merged = useMemo(() => {
			const prev = cachedTransformation ?? newTransformation;
			return structuralMerge(prev, newTransformation);
		}, [cachedTransformation, newTransformation]);

		// While the contents of reactiveSubscribe will update every render,
		// the subscription itself is always a one-shot deal, and new
		// subscriptions will only get set up every so often (in some cases,
		// they'll be set up once total). We need the transform to update
		// independently, so that even if the subscription fires once, we'll
		// keep re-syncing the transform logic based on the latest user-supplied
		// closure values
		const reactiveTransform = useEffectEvent(activeTransform);
		const reactiveSubscribe = useEffectEvent((targetMs: number) => {
			const unsub = rts.subscribe<T | null>({
				hookId,
				initialValue: merged,
				targetRefreshIntervalMs: targetMs,
				transform: reactiveTransform,
				onStateSync: () => {
					if (ejectedNotifyRef.current === noOp) {
						fallbackSync();
					} else {
						ejectedNotifyRef.current();
					}
				},
			});
			return unsub;
		});

		// Reminder: useEffect and useLayoutEffect clean up in batches. All cleanup
		// functions will fire at once for a given render (going from the bottom up
		// in the tree), and then all the new effects will fire (still bottom-up).
		// Having all the ReactTimeSync methods have cleanup functions in their
		// function signatures is the correct move, but since there's a single
		// ReactTimeSync instance, you have to be careful that cleanups for one
		// component don't break effects for another component.
		useLayoutEffect(() => {
			return reactiveSubscribe(targetRefreshIntervalMs);
		}, [reactiveSubscribe, targetRefreshIntervalMs]);
		useLayoutEffect(() => {
			rts.invalidateTransformation(hookId, merged);
		}, [rts, hookId, merged]);
		useLayoutEffect(() => {
			return rts.onComponentMount();
		}, [rts]);

		return merged satisfies T | null as UseTimeSyncResult<TIsServerRendered, T>;
	}

	return useTimeSync satisfies UseTimeSync<TIsServerRendered, unknown>;
}
