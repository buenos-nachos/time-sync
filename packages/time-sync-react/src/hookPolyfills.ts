import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Implemented to enable support for React on versions 18 (released March
 * 29, 2022) up to version 19.1.1 (released July 28, 2025). useEffectEvent was
 * only added to the core library in verison 19.2 (October 1, 2025).
 *
 * This polyfill tries to implement the public behavior of useEffectEvent as
 * possible, but it can't do much more than that, because it doesn't have direct
 * access to React internals.
 */
/* biome-ignore lint:complexity/noBannedTypes -- I don't want to use this type,
   since there is a much more type-safe of doing it for the 99% use case, and
   using Function actually forces you to deal with type contravariance issues.
   But this is what the official React types use, so we have to match it. */
export function useEffectEventPolyfill<T extends Function>(callback: T): T {
	const callbackRef = useRef(callback);

	// Need to have maximum firing priority on this just to be on the extra safe
	// side. We need to have other useInsertionEffects in the library, so we
	// need to make any potential edge cases impossible.
	useInsertionEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	// Don't want to deal with contravariance, so we're just going to make the
	// broadest wrapper function possible, and then do a type assertion. Not
	// worth doing it the "proper" way (if it's even possible for type Function)
	const stable = useCallback((...args: readonly unknown[]): unknown => {
		return callbackRef.current(...args);
	}, []);
	return stable as unknown as T;
}
