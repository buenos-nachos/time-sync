import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Implemented to enable support for React 18. useEffectEvent was only added
 * to the core library in verison 19.2.
 */
export function useEffectEvent<TArgs extends unknown[], TReturn = unknown>(
	callback: (...args: TArgs) => TReturn,
) {
	const callbackRef = useRef(callback);
  
	useInsertionEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	return useCallback((...args: TArgs): TReturn => {
		return callbackRef.current(...args);
	}, []);
}
