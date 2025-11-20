import type { ReadonlyDate } from "../../time-sync/src";

export type InitialDate = Date | (() => Date);

export type TransformCallback<T> = (
	date: ReadonlyDate,
) => T extends Promise<unknown> ? never : T extends void ? never : T;

export function noOp(..._: readonly unknown[]): void {}

/**
 * @todo 2025-11-17 - This isn't 100% correct, but for the initial
 * implementation, we're going to assume that no one is going to be monkey-
 * patching custom symbol keys or non-enumerable keys onto built-in types (even
 * though this sort of already happens in the standard library)
 *
 * @todo 2025-11-17 - This function doesn't have any cycle detection. That
 * should be added at some point
 */
export function structuralMerge<T = unknown>(oldValue: T, newValue: T): T {
	if (oldValue === newValue) {
		return oldValue;
	}

	// Making this the first major comparison, because realistically, a lot of
	// values are likely to be dates, since that's what you get when a custom
	// transformation isn't specified
	if (newValue instanceof Date) {
		if (!(oldValue instanceof Date)) {
			return newValue;
		}
		if (newValue.getMilliseconds() === oldValue.getMilliseconds()) {
			return oldValue;
		}
		return newValue;
	}

	switch (typeof newValue) {
		// If the new value is a primitive, we don't actually need to check the
		// old value at all. We can just return the new value directly, and have
		// JS language semantics take care of the rest
		case "boolean":
		case "number":
		case "bigint":
		case "string":
		case "undefined":
		case "symbol": {
			return newValue;
		}

		// If the new value is a function, we don't have a way of checking
		// whether the new function and old function are fully equivalent. While
		// we can stringify the function bodies and compare those, we have no
		// way of knowing if they're from the same execution context or have the
		// same closure values. Have to err on always returning the new value
		case "function": {
			return newValue;
		}

		case "object": {
			if (newValue === null || typeof oldValue !== "object") {
				return newValue;
			}
		}
	}

	if (Array.isArray(newValue)) {
		if (!Array.isArray(oldValue)) {
			return newValue;
		}

		const allMatch =
			oldValue.length === newValue.length &&
			oldValue.every((el, i) => el === newValue[i]);
		if (allMatch) {
			return oldValue;
		}
		const remapped = newValue.map((el, i) => structuralMerge(oldValue[i], el));
		return remapped as T;
	}

	const oldRecast = oldValue as Readonly<Record<string | symbol, unknown>>;
	const newRecast = newValue as Readonly<Record<string | symbol, unknown>>;

	const newStringKeys = Object.getOwnPropertyNames(newRecast);

	// If the new object has non-enumerable keys, there's not really much we can
	// do at a generic level to clone the object. So we have to return it out
	// unchanged
	const hasNonEnumerableKeys =
		newStringKeys.length !== Object.keys(newRecast).length;
	if (hasNonEnumerableKeys) {
		return newValue;
	}

	const newKeys = [
		...newStringKeys,
		...Object.getOwnPropertySymbols(newRecast),
	];

	const keyCountsMatch =
		newKeys.length ===
		Object.getOwnPropertyNames(oldRecast).length +
			Object.getOwnPropertySymbols(oldRecast).length;
	const allMatch =
		keyCountsMatch && newKeys.every((k) => oldRecast[k] === newRecast[k]);
	if (allMatch) {
		return oldValue;
	}

	const updated = { ...newRecast };
	for (const key of newKeys) {
		updated[key] = structuralMerge(oldRecast[key], newRecast[key]);
	}
	return updated as T;
}
