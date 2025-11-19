/**
 * @file This comment is here to provide clarity on why proxy objects might
 * always be a dead end for this library, and document failed experiments.
 *
 * Readonly dates need to have a lot of interoperability with native dates
 * (pretty much every JavaScript library uses the built-in type). So, this code
 * originally defined them as a Proxy wrapper over native dates. The handler
 * intercepted all methods prefixed with `set` and turned them into no-ops.
 *
 * That got really close to working, but then development ran into a critical
 * limitiation of the Proxy API. Basically, if the readonly date is defined with
 * a proxy, and you try to call Date.prototype.toISOString.call(readonlyDate),
 * that immediately blows up because the proxy itself is treated as the receiver
 * instead of the underlying native date.
 *
 * Vitest uses .call because it's the more airtight thing to do in most
 * situations, but proxy objects only have traps for .apply calls, not .call. So
 * there is no way in the language to intercept these calls and make sure
 * they're going to the right place.
 *
 * The good news, though, is that having an extended class might actually be the
 * better option, because it gives us the ability to define custom convenience
 * methods without breaking instanceof checks or breaking TypeScript
 * assignability for libraries that expect native dates. We just have to do a
 * little bit of extra work to fudge things for test runners.
 */

/**
 * Any extra methods for readonly dates.
 */
interface ReadonlyDateApi {
	/** Converts a readonly date into a native (mutable) date. */
	toDate(): Date;
}

/**
 * A readonly version of a Date object. To maximize compatibility with existing
 * libraries, all methods are the same as the native Date object at the type
 * level. But crucially, all methods prefixed with `set` have all mutation logic
 * removed.
 *
 * If you need a mutable version of the underlying date, ReadonlyDate exposes a
 * .toDate method to do a runtime conversion to a native/mutable date.
 */
export class ReadonlyDate extends Date implements ReadonlyDateApi {
	// Very chaotic type signature, but that's an artifact of how wonky the
	// native Date type is. Using conditional types isn't great, because the
	// number of arguments you can pass in can vary so much, so we're going for
	// ugly constructor overloads
	constructor();
	constructor(initValue: number | string | Date);
	constructor(year: number, monthIndex: number);
	constructor(year: number, monthIndex: number, day: number);
	constructor(year: number, monthIndex: number, day: number, hours: number);
	constructor(
		year: number,
		monthIndex: number,
		day: number,
		hours: number,
		seconds: number,
	);
	constructor(
		year: number,
		monthIndex: number,
		day: number,
		hours: number,
		seconds: number,
		milliseconds: number,
	);
	constructor(
		initValue?: number | string | Date,
		monthIndex?: number,
		day?: number,
		hours?: number,
		minutes?: number,
		seconds?: number,
		milliseconds?: number,
	) {
		/**
		 * This guard clause looks incredibly silly, but we need to do this to
		 * make sure that the readonly class works properly with Jest, Vitest,
		 * and anything else that supports fake timers.
		 *
		 * Basically:
		 * 1. We need to make sure that ReadonlyDate is linked to the Date
		 *    prototype, so that instanceof checks work correctly, and so that
		 *    the class can interop with all libraries that rely on vanilla
		 *    Dates.
		 * 2. In ECMAScript, this linking happens right as the module is
		 *    imported
		 * 3. Jest and Vitest will do some degree of hoisting before the
		 *    imports get evaluated, but most of the mock functionality happens
		 *    at runtime. useFakeTimers is NOT hoisted
		 * 4. A Vitest test file might import the readonly class at some point
		 *    (directly or indirectly), so that link is established.
		 * 5. useFakeTimers can then be called, and that updates the global
		 *    scope so that when any FUTURE code references the global Date
		 *    object, the fake version is used instead
		 * 6. But because the linking already happened before the call,
		 *    ReadonlyDate will still be bound to the original Date object
		 * 7. When super is called (which is required when extending classes),
		 *    the original date object will be instantiated and then linked to
		 *    the readonly instance via the prototype chain
		 * 8. None of this is a problem when you're instantiating with actual
		 *    inputs, because the date result will always be deterministic. The
		 *    problem happens when you call super with no arguments, because
		 *    that causes a new date to be created with the true system time,
		 *    instead of the fake system time.
		 * 9. So, to bridge the gap, we make a separate Date with `new Date()`
		 *    (after it's been turned into the fake version), and then write its
		 *    content into the date that was created with super/the real time.
		 */
		if (initValue === undefined) {
			super();
			const constructorOverrideForTestCorrectness = new Date();
			super.setTime(constructorOverrideForTestCorrectness.getTime());
			return;
		}

		if (monthIndex === undefined) {
			super(initValue);
			return;
		}
		if (typeof initValue !== "number") {
			throw new TypeError(
				`Impossible case encountered: init value has type of '${typeof initValue}, but additional arguments were provided after the first`,
			);
		}

		/* biome-ignore lint:complexity/noArguments -- Native dates are super
		 * wonky, and they actually check arguments.length to define behavior
		 * at runtime. We can't pass all the arguments in via a single call,
		 * because then the constructor will create an invalid date the moment
		 * it finds any single undefined value.
		 *
		 * Note that invalid dates are still date objects, and basically behave
		 * like NaN. We're going to throw errors as much as we can to avoid
		 * those weird values from creeping into the library.
		 *
		 * This is a weird case where TypeScript won't be able to help us,
		 * because it has no concept of the arguments meta parameter in its type
		 * system. Brendan Eich's sins in 1995 are biting us 30 years later.
		 */
		const argCount = arguments.length;
		switch (argCount) {
			case 2: {
				super(initValue, monthIndex);
				return;
			}
			case 3: {
				super(initValue, monthIndex, day);
				return;
			}
			case 4: {
				super(initValue, monthIndex, day, hours);
				return;
			}
			case 5: {
				super(initValue, monthIndex, day, hours, minutes);
				return;
			}
			case 6: {
				super(initValue, monthIndex, day, hours, minutes, seconds);
				return;
			}
			case 7: {
				super(
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

	/**
	 * This is used to help fudge things a little bit in test runners like
	 * Vitest. They tend to look at the string tag associated with an object to
	 * decide how to process it, rather than going through the prototype chain.
	 *
	 * Vitest does this via Object.prototype.toString.call(value), which always
	 * gives back a string formatted like "[object ReadonlyDate]". Not sure what
	 * other options are available.
	 *
	 * Manually overriding the symbol method means that we can trick Vitest into
	 * processing readonly dates as native dates for testing. This technically
	 * does creep into the behavior exposed to end users, but most users are
	 * going to use instanceof
	 */
	[Symbol.toStringTag](): string {
		return "Date";
	}

	toDate(): Date {
		// While you can do property accesses on super, which makes it look like
		// an object, it's technically not an object itself, so you can't use
		// super as a standalone value. We have to use super to pull a concrete
		// value from the underlying date in the prototype chain, and then make
		// a new date from that.
		const time = super.getTime();
		return new Date(time);
	}

	////////////////////////////////////////////////////////////////////////////
	// Start of custom set methods to shadow the ones from native dates. Note
	// that all set methods expect that the underlying timestamp be returned
	// afterwards, which always corresponds to Date.getTime.
	////////////////////////////////////////////////////////////////////////////

	setDate(_date: number): number {
		return super.getTime();
	}

	setFullYear(_year: number, _month?: number, _date?: number): number {
		return super.getTime();
	}

	setHours(_hours: number, _min?: number, _sec?: number, _ms?: number): number {
		return super.getTime();
	}

	setMilliseconds(_ms: number): number {
		return super.getTime();
	}

	setMinutes(_min: number, _sec?: number, _ms?: number): number {
		return super.getTime();
	}

	setMonth(_month: number, _date?: number): number {
		return super.getTime();
	}

	setSeconds(_sec: number, _ms?: number): number {
		return super.getTime();
	}

	setTime(_time: number): number {
		return super.getTime();
	}

	setUTCDate(_date: number): number {
		return super.getTime();
	}

	setUTCFullYear(_year: number, _month?: number, _date?: number): number {
		return super.getTime();
	}

	setUTCHours(
		_hours: number,
		_min?: number,
		_sec?: number,
		_ms?: number,
	): number {
		return super.getTime();
	}

	setUTCMilliseconds(_ms: number): number {
		return super.getTime();
	}

	setUTCMinutes(_min: number, _sec?: number, _ms?: number): number {
		return super.getTime();
	}

	setUTCMonth(_month: number, _date?: number): number {
		return super.getTime();
	}

	setUTCSeconds(_sec: number, _ms?: number): number {
		return super.getTime();
	}
}
