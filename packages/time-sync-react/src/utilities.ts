import type { ReadonlyDate } from "@buenos-nachos/time-sync";

/**
 * A callback that receives a ReadonlyDate instance, and can transform it into
 * any arbitrary value.
 */
// This type originally had a more sophisticated signature to prevent it from
// returning promises. But now React now has support for consuming promises
// from inside a render via Suspsense and `use`. A promise is probably a mistake
// 99% of the time, but this library shouldn't stop someone from trying.
export type TransformCallback<T> = (date: ReadonlyDate) => T;

/* biome-ignore lint:suspicious/noEmptyBlockStatements -- Rare case where we do
   actually want a completely empty function body. */
export function noOp(..._: readonly unknown[]): void {}

// Composite tracker isn't meant to track all non-primitives; just
// non-primitives that rely on value nesting
function structuralMergeWithCycleDetection<T = unknown>(
	compositeTracker: unknown[],
	oldValue: T,
	newValue: T,
): T {
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
		if (newValue.getTime() === oldValue.getTime()) {
			return oldValue;
		}
		return newValue;
	}

	// Handle all cases we can get from the typeof operator; only arrays and
	// objects will be left afterwards
	switch (typeof newValue) {
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
		// same closure values. Have to err on always returning the new value,
		// but also, computing a function via useTimeSync seems SUPER niche?
		case "function": {
			return newValue;
		}

		// Have to catch null, since its typeof value is "object"
		case "object": {
			if (newValue === null || typeof oldValue !== "object") {
				return newValue;
			}
		}
	}

	// No idea why Object.keys requires a type assertion, but this doesn't
	const newStringKeys = Object.getOwnPropertyNames(newValue);

	// If the new object has non-enumerable keys, there's not really much we can
	// do at a generic level to clone the object. So we have to return it out
	// unchanged
	const hasNonEnumerableKeys =
		newStringKeys.length !==
		Object.keys(newValue as NonNullable<unknown>).length;
	if (hasNonEnumerableKeys) {
		return newValue;
	}

	for (const tracked of compositeTracker) {
		if (tracked === oldValue || tracked === newValue) {
			throw new Error("Detected cycle in nested value definition");
		}
	}
	compositeTracker.push(oldValue);
	compositeTracker.push(newValue);

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
		const remapped = newValue.map((el, i) =>
			structuralMergeWithCycleDetection(compositeTracker, oldValue[i], el),
		);
		return remapped as T;
	}

	const oldRecast = oldValue as Readonly<Record<string | symbol, unknown>>;
	const newRecast = newValue as Readonly<Record<string | symbol, unknown>>;

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
		const newV = newRecast[key];
		if (compositeTracker.includes(newV)) {
			throw new Error("Detected cycle in nested value definition");
		}
		updated[key] = structuralMergeWithCycleDetection(
			compositeTracker,
			oldRecast[key],
			newValue,
		);
	}
	return updated as T;
}

export function structuralMerge<T = unknown>(oldValue: T, newValue: T): T {
	const compositeTracker: unknown[] = [];
	return structuralMergeWithCycleDetection(
		compositeTracker,
		oldValue,
		newValue,
	);
}
