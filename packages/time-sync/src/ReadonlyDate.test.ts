import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { ReadonlyDate } from "./ReadonlyDate";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
});

const defaultDateString = "October 27, 2025";

// new ReadonlyDate is mostly being treated as an internal implementation
// detail for the moment, but because we still export it for convenience,
// we need to make sure that it's 100% interchangeable with native Date
// objects for all purposes aside from mutations
describe(ReadonlyDate, () => {
	it("Appears as native Date type for external consumers", ({ expect }) => {
		const d = new ReadonlyDate();
		expect(d).toBeInstanceOf(Date);
	});

	// Asserting this first because we rely on this behavior for the other tests
	it("Supports .toEqual checks against native Dates in test runners", ({
		expect,
	}) => {
		const controlDate = new Date(defaultDateString);
		const readonly = new ReadonlyDate(defaultDateString);
		expect(controlDate).toEqual(readonly);
	});

	it("Mirrors type signature of native Dates", ({ expect }) => {
		// Have to save the version without arguments for last, because it
		// requires the most mocking, and has a risk of breaking the other cases
		type TestCase = Readonly<{
			input: readonly (number | string | Date)[];
			expected: Date;
		}>;
		const cases = [
			{
				input: [752_475_600_000],
				expected: new Date("November 5, 1993"),
			},
			{
				input: ["September 4, 2000"],
				expected: new Date("September 4, 2000"),
			},
			{
				input: [new Date("January 8, 1940")],
				expected: new Date("January 8, 1940"),
			},
			{
				input: ["2006-11-01T05:00:00.000Z"],
				expected: new Date("2006-11-01T05:00:00.000Z"),
			},
			{
				input: [2009, 10],
				expected: new Date("November 1, 2009"),
			},
			{
				input: [2008, 2, 4],
				expected: new Date("March 4, 2008"),
			},
			{
				input: [2000, 1, 1, 5],
				expected: new Date("2000-02-01T10:00:00.000Z"),
			},
			{
				input: [1990, 0, 5, 20, 6],
				expected: new Date("1990-01-06T01:06:00.000Z"),
			},
			{
				input: [2000, 10, 8, 5, 17, 20],
				expected: new Date("2000-11-08T10:17:20.000Z"),
			},
			{
				input: [2005, 7, 4, 20, 37, 57, 3],
				expected: new Date("2005-08-05T00:37:57.003Z"),
			},
		] satisfies readonly TestCase[];

		for (const { input, expected } of cases) {
			// @ts-expect-error -- This should always work at runtime, but the
			// TypeScript compiler isn't smart enough to figure that out
			const readonly = new ReadonlyDate(...input);
			expect(readonly).toEqual(expected);
		}

		const control = new Date(defaultDateString);
		vi.setSystemTime(control);
		const withoutArgs = new ReadonlyDate();
		expect(withoutArgs).toEqual(control);
	});

	it("Turns all mutation methods into no-ops", ({ expect }) => {
		const source = new ReadonlyDate(defaultDateString);
		const copyBeforeMutations = new ReadonlyDate(source);

		const setTests: readonly (() => void)[] = [
			() => source.setDate(4_932_049_023),
			() => source.setFullYear(2000),
			() => source.setHours(50),
			() => source.setMilliseconds(499),
			() => source.setMinutes(45),
			() => source.setMonth(3),
			() => source.setSeconds(40),
			() => source.setTime(0),
			() => source.setUTCDate(3),
			() => source.setUTCFullYear(1994),
			() => source.setUTCHours(7),
			() => source.setUTCMilliseconds(45),
			() => source.setUTCMinutes(57),
			() => source.setUTCMonth(3),
			() => source.setUTCSeconds(20),
		];
		for (const test of setTests) {
			test();
		}

		expect(source).toEqual(copyBeforeMutations);
	});

	it("Can be instantiated via other ReadonlyDates", ({ expect }) => {
		const first = new ReadonlyDate(defaultDateString);
		const derived = new ReadonlyDate(first);
		expect(first).toEqual(derived);
	});

	it("Can be converted to a native date", ({ expect }) => {
		const d = new ReadonlyDate("February 5, 1770");
		const converted = d.toNativeDate();

		expect(d).toEqual(converted);
		expect(converted).toBeInstanceOf(Date);
		expect(converted).not.toBeInstanceOf(ReadonlyDate);
	});

	it("Throws when provided invalid input (instead of failing silently like with native dates)", ({
		expect,
	}) => {
		const invalidDate = new Date(Number.NaN);
		expect(() => new ReadonlyDate(invalidDate)).toThrow(
			RangeError("Cannot instantiate ReadonlyDate via invalid date object"),
		);

		// Ideally we shouldn't need to worry about undefined values because the
		// constructor type signature will let you know when you got something
		// wrong
		const invalidNums: readonly number[] = [
			Number.NaN,
			Number.NEGATIVE_INFINITY,
			-Number.NEGATIVE_INFINITY,
		];
		for (const i of invalidNums) {
			expect(() => new ReadonlyDate(i)).toThrow(
				RangeError("Cannot instantiate ReadonlyDate via invalid number(s)"),
			);
		}

		const invalidStrings: readonly string[] = [
			"blah",
			"2025-11-20 T13:59:19.545Z", // Extra space inserted
		];
		for (const i of invalidStrings) {
			expect(() => new ReadonlyDate(i)).toThrow(
				RangeError("Cannot instantiate ReadonlyDate via invalid string"),
			);
		}
	});
});
