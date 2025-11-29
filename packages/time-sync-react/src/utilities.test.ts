import { describe, it } from "vitest";
import { structuralMerge } from "./utilities";

describe.concurrent(structuralMerge, () => {
	type TestCase = readonly [value1: unknown, value2: unknown];

	function dummyFunction(): boolean {
		return true;
	}

	describe("General behavior", () => {
		it("Returns old value untransformed if old value and new value are actually equal", ({
			expect,
		}) => {
			expect.hasAssertions();
		});
	});

	describe("Comparing primitives with primitives", () => {
		it("Always returns new value when both values are of different types", ({
			expect,
		}) => {
			const cases: readonly TestCase[] = [
				["string", 1],
				["string", true],
				["string", null],
				["string", undefined],
				["string", Symbol()],
				["string", BigInt(0)],

				[1, true],
				[1, null],
				[1, undefined],
				[1, Symbol()],
				[1, BigInt(0)],

				[true, null],
				[true, undefined],
				[true, Symbol()],
				[true, BigInt(0)],

				[null, undefined],
				[null, Symbol()],
				[null, BigInt(0)],

				[undefined, Symbol()],
				[undefined, BigInt(0)],
				[undefined, BigInt(0)],

				[BigInt(0), BigInt(1)],
			];

			for (const [value1, value2] of cases) {
				const result1 = structuralMerge(value1, value2);
				expect(result1).toBe(value2);
				const result2 = structuralMerge(value2, value1);
				expect(result2).toBe(value1);
			}
		});
	});

	describe("Comparing functions with other values", () => {
		it("Always returns new value if at least one value is a function", ({
			expect,
		}) => {
			const result1 = structuralMerge(undefined, dummyFunction);
			expect(result1).toBe(dummyFunction);
			const result2 = structuralMerge(dummyFunction, undefined);
			expect(result2).toBe(undefined);

			const other = () => false;
			const result3 = structuralMerge(other, dummyFunction);
			expect(result3).toBe(dummyFunction);
			const result4 = structuralMerge(dummyFunction, other);
			expect(result4).toBe(other);
		});
	});

	describe("Comparing two JSON-serializable objects", () => {
		it("", ({ expect }) => {
			expect.hasAssertions();
		});
	});

	describe("Cycle detection", () => {
		it("", ({ expect }) => {
			expect.hasAssertions();
		});
	});
});
