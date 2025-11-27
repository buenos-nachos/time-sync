import { TimeSync } from "@buenos-nachos/time-sync";

const injectionTypes = [
	"closure",
	"reactContext",
	"hybrid",
] as const satisfies readonly string[];

export type InjectionType = (typeof injectionTypes)[number];

export function isInjectionType(value: unknown): value is InjectionType {
	return injectionTypes.includes(value as InjectionType);
}

type CreateReactBindingsOptions<T extends InjectionType> =
	T extends "reactContext"
		? {
				injectionType: T;
			}
		: {
				injectionType: T;
				timeSync: TimeSync;
			};

type CreateReactBindingsResult<T extends InjectionType> = T extends "closure"
	? {
			useTimeSync: unknown;
			useTimeSyncRef: unknown;
		}
	: {
			useTimeSync: unknown;
			useTimeSyncRef: unknown;
			TimeSyncProvider: unknown;
		};

export function createReactBindings<T extends InjectionType>(
	_: CreateReactBindingsOptions<T>,
): CreateReactBindingsResult<T> {
	return {
		TimeSyncProvider: "",
		useTimeSync: "",
		useTimeSyncRef: "",
	};
}

const sync = new TimeSync();

export const { TimeSyncProvider, useTimeSync, useTimeSyncRef } =
	createReactBindings({
		injectionType: "hybrid",
		timeSync: sync,
	});
