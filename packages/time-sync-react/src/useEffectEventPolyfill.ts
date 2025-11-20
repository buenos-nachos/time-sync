import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Implemented to enable support for React on versions 18 (released March
 * 29, 2022) up to version 19.1.1. useEffectEvent was only added to the
 * core library in verison 19.2 (October 1, 2025).
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
