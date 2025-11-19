import { noOp } from "./utils";

/**
 * All of TimeSync is basically centered around managing a single Date value,
 * keeping it updated, and notifying subscribers of changes over time. If even a
 * single mutation slips through, that has a risk of breaking everything. So for
 * correctness guarantees, we have to prevent runtime mutations and can't just
 * hope that lying to TypeScript about the types is enough.
 *
 * Date objects have a lot of private state that can be modified via its set
 * methods, so Object.freeze doesn't do anything to help us.
 */
const readonlyHandler: ProxyHandler<Date> = {
	// Note: overriding property setting like this will protect the date, but
	// will cause runtime errors in most environments. But because random monkey
	// patching would likely break the entire library's system, blowing up is
	// actually preferrable
	set: () => false,

	get: (date, key, receiver) => {
		if (typeof key === "string" && key.startsWith("set")) {
			return noOp;
		}
		// This is necessary for making sure that readonly dates interop
		// properly with .toEqual in Jest and Vitest, and that their various
		// internal utility functions can process the proxy as a date
		if (key === Symbol.toStringTag) {
			return "Date";
		}

		/**
		 * There's a couple of things we're accounting for here:
		 * 1. In general, when we send back a method from the date object, we
		 *    need to make sure that it can't ever lose its `this` context.
		 *    Because we don't control the site where the property access would
		 *    happen, we have to create a wrapper function that binds the
		 *    context (arrow functions should work here, too).
		 * 2. Vitest's internal utility functions sometimes need to grab the
		 *    constructor from the Date. In that case, having the function lose
		 *    its `this` context is fine, and if we wrap it, we'll actually
		 *    break things because Vitest always expects the native constructor
		 */
		const value = Reflect.get(date, key, receiver);
		if (typeof value === "function" && key !== "constructor") {
			return value.bind(date);
		}
		return value;
	},
};

/**
 * Returns a Date that cannot be modified at runtime (all its `set` methods
 * will still exist at runtime, but are turned into no-ops).
 *
 * This function does not use a custom type to make it easier to interface with
 * existing time libraries.
 */
// Very chaotic type signature, but that's an artifact of how wonky the native
// Date type is. Using conditional types isn't great, because the number of
// arguments you can pass in can vary so much, so we're going for ugly function
// overloads
export function newReadonlyDate(): Date;
export function newReadonlyDate(initValue: number | string | Date): Date;
export function newReadonlyDate(year: number, monthIndex: number): Date;
export function newReadonlyDate(
	year: number,
	monthIndex: number,
	day: number,
): Date;
export function newReadonlyDate(
	year: number,
	monthIndex: number,
	day: number,
	hours: number,
): Date;
export function newReadonlyDate(
	year: number,
	monthIndex: number,
	day: number,
	hours: number,
	seconds: number,
): Date;
export function newReadonlyDate(
	year: number,
	monthIndex: number,
	day: number,
	hours: number,
	seconds: number,
	milliseconds: number,
): Date;
export function newReadonlyDate(
	initValue?: number | string | Date,
	monthIndex?: number,
	day?: number,
	hours?: number,
	minutes?: number,
	seconds?: number,
	milliseconds?: number,
): Date {
	let source: Date;
	if (initValue === undefined) {
		source = new Date();
	} else if (monthIndex === undefined) {
		source = new Date(initValue);
	} else if (typeof initValue !== "number") {
		throw new TypeError(
			`Impossible case encountered: init value has type of '${typeof initValue}, but additional arguments were provided after the first`,
		);
	} else {
		/* biome-ignore lint:complexity/noArguments -- Native dates are super
		 * wonky, and they actually check arguments.length to define behavior
		 * at runtime. We can't pass all the arguments in via a single call,
		 * because then the constructor will create an invalid date the moment
		 * it finds any single undefined value.
		 *
		 * Note that invalid dates are still date objects, and basically behave
		 * like NaN. We're going to throw as much as we can to avoid those weird
		 * values from creeping into the library.
		 *
		 * This is a weird case where TypeScript won't be able to help us,
		 * because it has no concept of the arguments meta parameter in its type
		 * system. Brendan Eich's sins in 1995 are biting us 30 years later.
		 */
		const argCount = arguments.length;
		switch (argCount) {
			case 2: {
				source = new Date(initValue, monthIndex);
				break;
			}
			case 3: {
				source = new Date(initValue, monthIndex, day);
				break;
			}
			case 4: {
				source = new Date(initValue, monthIndex, day, hours);
				break;
			}
			case 5: {
				source = new Date(initValue, monthIndex, day, hours, minutes);
				break;
			}
			case 6: {
				source = new Date(initValue, monthIndex, day, hours, minutes, seconds);
				break;
			}
			case 7: {
				source = new Date(
					initValue,
					monthIndex,
					day,
					hours,
					minutes,
					seconds,
					milliseconds,
				);
				break;
			}
			default: {
				throw new Error(
					`Cannot instantiate new Date with ${argCount} arguments`,
				);
			}
		}
	}

	return new Proxy(source, readonlyHandler);
}
