# How to use the `time-sync` package

<!-- prettier-ignore-start -->
> [!WARNING]
> While the `TimeSync` class is designed to be instantiated any number of times (especially for testing), it is HIGHLY recommended that each device only ever have one instance at a time, to ensure everything stays in sync. Treat `TimeSync` how you would [a global Redux store](https://redux.js.org/style-guide/#only-one-redux-store-per-app).
<!-- prettier-ignore-end -->

## Installation

```bash
// PNPM
pnpm i -E @buenos-nachos/time-sync

// NPM
npm i -E @buenos-nachos/time-sync

// Yarn
yarn add -E @buenos-nachos/time-sync
```

## Usage

### Initializing

```ts
// setupFile.ts
import { TimeSync } from "@buenos-nachos/time-sync";

// TimeSync tries to have sensible defaults, but an options object can be
// passed to the constructor to configure behavior.
export const sync = new TimeSync();

export const syncWithOptions = new TimeSync({
	// By default, TimeSync initializes itself with the current system time.
	// A specific date can be provided to make the TimeSync result 100% pure and
	// deterministic, which helps with testing and server-to-client hydration.
	initialDate: new Date("August 1, 2045"),

	// This tells TimeSync to freeze all internal state, effectively turning all
	// subscriptions into no-ops. Most useful for snapshot tests; highly
	// recommended that you use this together with `initialDate`
	freezeUpdates: true,

	// Can be used to provide a minimum threshold for how often updates should
	// be dispatched. If a consumer tries to subscribe with a lower value, this
	// minimum will be used instead
	minimumRefreshIntervalMs: 500,

	// When setting up a subscription, TimeSync allows multiple subscribers to
	// register the same pair of refresh interval and onUpdate callback
	// (determined by reference equality). By default, each callback is called
	// once for each subscriber. But since updates always happen at once, you can
	// opt into de-duplicating calls. While this is off, each onUpdate callback
	// will receive the context value for the OLDEST active subscription that
	// registered the onUpdate callback.
	allowDuplicateFunctionCalls: false,
});
```

### Basic usage

```ts
// consumingFile.ts
import {
	ReadonlyDate,
	refreshRates,
	type SubscriptionContext,
} from "@buenos-nachos/time-sync";
import { sync } from "./setupFile";

// This tells TimeSync that we have a new subscriber that needs to be updated
// NO SLOWER than every five minutes. Subscribers are allowed to be notified
// more often than this, if it would keep all subscribers in sync. As this
// is the first subscriber, this also kicks off a new interval that will
// dispatch an update every 5 minutes.
const unsubscribe1 = sync.subscribe({
	// refreshRates contains a set of commonly-used intervals, but any
	// positive integer is valid
	targetRefreshIntervalMs: refreshRates.fiveMinutes,

	// newDate is a special ReadonlyDate class that enforces readonly access at
	// runtime. It also includes a .toNativeDate method to convert it to a
	// native/mutable date.
	onUpdate: (newDate) => {
		console.log(`The new date is ${newDate.toDateString()}`);
	},
});

// All subscribers are automatically updated by the fastest interval currently
// active among all subscriptions. Adding this subscription accelerates the
// interval to start happening every minute instead.
const unsubscribe2 = sync.subscribe({
	targetRefreshIntervalMs: refreshRates.oneMinute,

	// Each onUpdate callback also exposes a second parameter that is a context
	// value with information about the subscription. See the next section on
	// context values for more information
	onUpdate: (newDate, ctx) => {
		console.log(`The seconds is now ${newDate.getSeconds()}`);
		console.log(`First registered at ${ctx.registeredAtMs}`);
	},
});

// Once a subscriber leaves, TimeSync automatically re-calculates the fastest
// interval, and makes sure not to restart the interval from scratch. Let's say
// this unsubscribe happens 45 seconds after the last update. Subscriber 1 will
// be updated in 4 minutes and 15 seconds, rather than in five minutes.
unsubscribe2();

// If we were to call this, there would be no subscribers, and no need for an
// active interval, so TimeSync would automatically clear it.
unsubscribe1();

// Calling any unsubscribe callback more than once always results in a no-op.
unsubscribe1();

// To maximize interoperability with existing JavaScript libraries, the
// ReadonlyDate class is fully assignable to the native date class. Any
// function that takes a native date as input works with onUpdate out of the
// box.
function displayYear(date: Date): void {
	// When used with TimeSync's onUpdate property, both of these runtime checks
	// will evaluate to true
	if (date instanceof ReadonlyDate) {
		console.log("Received ReadonlyDate at runtime");
	}
	if (date instanceof Date) {
		console.log(`The year is ${newDate.getYear()}`);
	}
}

const unsubscribe3 = sync.subscribe({
	// This refresh rate lets a subscriber "passively" subscribe to the
	// TimeSync. It does not trigger updates on its own, but the subscriber can
	// be notified when other subscribers change so that it can be "kept in the
	// loop". If all subscribers use this interval, no updates will ever be
	// dispatched.
	targetRefreshIntervalMs: refreshRates.idle,
	onUpdate: displayYear,
});

// Let's say that five seconds have passed since the last update, and then this
// subscription gets added...
const unsubscribe4 = sync.subscribe({
	// ...If a new subscription is added that has a refresh interval less than
	// or equal to the elapsed time since the last update, all subscribers will
	// be notified immediately. Afterwards, a new subscription cycle will start
	// with the fastest interval among all subscribers
	targetRefreshIntervalMs: refreshRates.oneSecond,

	// As mentioned above, you can tell TimeSync whether you want it to
	// de-duplicate multiple copies of the same function received by reference
	onUpdate: displayYear,
});

// This lets you pull an immutable snapshot of the TimeSync's inner state. The
// immutability is enforced at runtime and at the type level.
const snap = sync.getStateSnapshot();

// This clears out all subscribers and clears the active interval. This is
// useful for making for making sure a locally-scoped TimeSync can be torn down
// properly, but can also be used to reset a global TimeSync between test runs
sync.clearAll();
```

### Context usage

```ts
// consumingFile.ts
import {
	ReadonlyDate,
	refreshRates,
	type SubscriptionContext,
} from "@buenos-nachos/time-sync";
import { sync } from "./setupFile";

// Each onUpdate function also exposes a second context argument. This provides
// information about the specific subscription that was registered, but it
// also provides an alternative to closure for receiving data dependencies
function processOnUpdate(date: ReadonlyDate, ctx: SubscriptionContext): void {
	// A reference to the TimeSync instance that the subscription was registered
	// with. Can be used to grab snapshots or even register new subscriptions
	ctx.timeSync;

	// Provides a reference to when the subscription was first set up. This value
	// is monotonic and is defined relative to when the TimeSync was instantiated
	ctx.registeredAtMs;
	console.log(`Subscription was registered at ${ctx.registeredAt}`);

	// Indicates the interval the callback was registered with. This value may
	// be larger than the value that was explicitly requested, depending on the
	// minimumRefreshIntervalMs value used during instantiation
	ctx.targetRefreshIntervalMs;
	console.log(`This subscription runs every ${ctx.targetRefreshIntervalMs}`);

	// This is the same callback that you receive when you call the subscribe
	// method (exact same reference equality)
	ctx.unsubscribe;
	const shouldCancel = shouldCancelSubscription(date);
	if (shouldCancel) {
		ctx.unsubscribe();
	}
}

const unsub = sync.subscribe({
	onUpdate: processOnUpdate,
	targetRefreshIntervalMs: refreshRates.oneHour,
});
```

## Advanced use cases

### Limiting how often expensive functions run

```ts
const unsub1 = sync.subscribe({
	targetRefreshIntervalMs: refreshRates.oneSecond,
	onUpdate: cheapFunction,
});

// One of the limitations of JavaScript's time-based updates is that intervals
// won't always be dispatched with 100% precision. They can potentially be
// delayed depending on what other operations are running. Promise-based
// operations are higher-priority, but expensive synchronous operations can
// block the thread, too. We need a small epsilon tolerance to account for
// this language limitation
const taskQueueToleranceMs = 50;

const unsub2 = sync.subscribe({
	targetRefreshIntervalMs: refreshRates.thirtySeconds,
	onUpdate: (newDate, ctx) => {
		// This logic ensures that while the subscription will be processed along
		// with everything else, the core, expensive functionality will only run
		// when an update lines up with the interval we explicitly requested
		const snap = ctx.timeSync.getStateSnapshot();
		const deltaSinceRegistering =
			(snap.lastUpdatedAtMs ?? 0) - ctx.registeredAtMs;
		const fulfillsInterval =
			deltaSinceRegistering > 0 &&
			deltaSinceRegistering % ctx.refreshIntervalMs < taskQueueToleranceMsd;
		if (fulfillsInterval) {
			runExpensiveFunction(newDate);
		}
	},
});
```
