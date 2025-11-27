import type { ReadonlyDate } from "@buenos-nachos/time-sync";

export type TransformCallback<T> = (
	date: ReadonlyDate,
) => T extends Promise<unknown> ? never : T extends void ? never : T;

/* biome-ignore lint:suspicious/noEmptyBlockStatements -- Rare case where we do
   actually want a completely empty function body. */
export function noOp(..._: readonly unknown[]): void {}
