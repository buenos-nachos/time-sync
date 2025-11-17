import { afterEach, describe, it, vi } from "vitest";
import { newReadonlyDate } from "./readonlyDate";

const defaultDateString = "October 27, 2025";

// newReadonlyDate is mostly being treated as an internal implementation
// detail for the moment, but because we still export it for convenience,
// we need to make sure that it's 100% interchangeable with native Date
// objects for all purposes aside from mutations
describe.concurrent(newReadonlyDate.name, () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// Asserting this first because we rely on this behavior for the other tests
	it("Supports .toEqual checks against native Dates", ({ expect }) => {
		const controlDate = new Date(defaultDateString);
		const readonly = newReadonlyDate(defaultDateString);
		expect(controlDate).toEqual(readonly);
	});

	/**
	 * @todo 2025-11-16 - Need to figure out why, but for some reason, sometimes
	 * when you create an expected native Date via an ISO string, all
	 * comparisons against it and the readonly Date created during the test fail
	 * with a TypeError from trying to access the .toISOString method
	 * (presumably on the readonly date).
	 *
	 * Having trouble reproducing this error – seems very flaky.
	 *
	 * Calling .toISOString on the readonly date still works, so this might be
	 * some weird nuance from how Vitest works.
	 *
	 * Current investigations point towards this being a case where native Dates
	 * have weird interactions with proxy objects
	 * @see {@link https://community.n8n.io/t/method-date-prototype-toisostring-called-on-incompatible-receiver-object-date/24541}
	 *
	 * This behavior has a chance of affecting users, but it's being
	 * de-prioritized for the initial launch, because it should hopefully be a
	 * niche issue.
	 */
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
			const readonly = newReadonlyDate(...input);
			expect(readonly).toEqual(expected);
		}

		const control = new Date(defaultDateString);
		vi.setSystemTime(control);
		const withoutArgs = newReadonlyDate();
		expect(withoutArgs).toEqual(control);
	});

	it("Can be instantiated via other readonly Dates", ({ expect }) => {
		const first = newReadonlyDate(defaultDateString);
		const derived = newReadonlyDate(first);
		expect(first).toEqual(derived);
	});

	it("Turns all mutation methods into no-ops", ({ expect }) => {
		const source = newReadonlyDate(defaultDateString);
		const copyBeforeMutations = newReadonlyDate(source);

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

	it("Throws on direct property mutations", ({ expect }) => {
		const mutations: readonly ((d: Date) => void)[] = [
			(d) => {
				d.getDate = () => NaN;
			},
			(d) => {
				d.getMonth = () => NaN;
			},
			(d) => {
				d.setDate = () => NaN;
			},
		];

		const normalDate = new Date(defaultDateString);
		for (const mutate of mutations) {
			expect(() => mutate(normalDate)).not.toThrow();
		}

		const readonly = newReadonlyDate(defaultDateString);
		for (const mutate of mutations) {
			expect(() => mutate(readonly)).toThrow(TypeError);
		}
	});
});
