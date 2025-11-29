import { describe, it } from "vitest";
import { structuralMerge } from "./utilities";

describe.concurrent(structuralMerge, () => {
	it("", ({ expect }) => {
		expect.hasAssertions();
	});

	describe("Comparing primitives with primitives", () => {
		it("Always returns the new value", ({ expect }) => {
			type TestCase = readonly [value1: unknown, value2: unknown];
			const cases = [
				["string", "string"],
				["string", 1],
				["string", true],
				["string", null],
				["string", undefined],
				["string", Symbol()],
				["string", BigInt(0)],

				[1, 1],
				[1, true],
				[1, null],
				[1, undefined],
				[1, Symbol()],
				[1, BigInt(0)],

				[true, true],
				[true, null],
				[true, undefined],
				[true, Symbol()],
				[true, BigInt(0)],

				[null, null],
				[null, undefined],
				[null, Symbol()],
				[null, BigInt(0)],

				[undefined, undefined],
				[undefined, Symbol()],
				[undefined, BigInt(0)],

				[Symbol(), Symbol()],
				[undefined, BigInt(0)],

				[BigInt(0), BigInt(0)],
			] as const satisfies readonly TestCase[];

			for (const [value1, value2] of cases) {
				const result1 = structuralMerge(value1, value2);
				expect(result1).toBe(value2);
				const result2 = structuralMerge(value2, value1);
				expect(result2).toBe(value1);
			}
		});
	});
});
