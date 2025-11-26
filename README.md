# time-sync

<!-- prettier-ignore-start -->
[![MIT License](https://img.shields.io/github/license/buenos-nachos/time-sync.svg?color=darkslateblue)](https://github.com/buenos-nachos/time-sync/blob/main/LICENSE) 
[![CI/CD](https://github.com/buenos-nachos/time-sync/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/buenos-nachos/time-sync/actions/workflows/ci.yaml)
<!-- prettier-ignore-end -->

![time-sync logo](./images/banner.png)

`time-sync` is a set of packages designed to make it foolproof to work with time values on a single device. This can be multiple UI components on a single client device, or a series of UI snapshot tests being run in a platform like Storybook. While `time-sync` is mostly intended for UIs, the vanilla version also has zero dependencies and can be used for stateful servers. The packages force you as a developer to specify when and how time should be updated, while also centralizing updates to a single place.

In other words, the goal of `time-sync` is to make time more obvious and less magical.

## Features

- 🔄 **Keep things in sync** – `time-sync` ensures that different systems on one device can't ever get out of sync with each other.
- 📸 **No more snapshot flakes** – `time-sync` makes it easy to freeze the date to a specific value to ensure that your snapshot tests stay deterministic. The upcoming UI framework bindings will have out-of-the-box support for platforms like Storybook.
- 📦 **As few dependencies as possible** – The vanilla version of `time-sync` has zero runtime dependencies. Each package for binding it to a framework aims to have only that framework as a dependency.

### Coming soon

- 🖥️ **Bindings for popular UI frameworks** – `time-sync` will be launching bindings for React in the next few weeks. Solid.js bindings will launch soon after. Other frameworks may be added based on demand/interest.
- 🏝️ **Astro islands** – All the packages for binding `time-sync` to a UI framework will support Astro out of the box. This includes support for islands and the ability to mix the bindings with `.astro` files.
- 💿 **Mix and match UI frameworks** – The React and Solid.js packages are being designed so that they can be used together in a single Astro project. Any future framework bindings will aim to have the same support.

## Quick start

### Installation

You can get started with the vanilla package like so. It is required for interfacing with all other `time-sync` packages.

```bash
// PNPM
pnpm i -E @buenos-nachos/time-sync

// NPM
npm i -E @buenos-nachos/time-sync

// Yarn
yarn add -E @buenos-nachos/time-sync
```

Other packages can be installed in a similar way. For example, the React package is installed like this:

```bash
// PNPM
pnpm i -E @buenos-nachos/time-sync @buenos-nachos/time-sync-react

// NPM
npm i -E @buenos-nachos/time-sync @buenos-nachos/time-sync-react

// Yarn
yarn add -E @buenos-nachos/time-sync @buenos-nachos/time-sync-react
```

### Usage

<!-- prettier-ignore-start -->
> [!WARNING]
> While the `TimeSync` class is designed to be instantiated any number of times (especially for testing), it is HIGHLY recommended that each device only ever have one instance at a time. Treat it how you would [a global Redux store](https://redux.js.org/style-guide/#only-one-redux-store-per-app).
<!-- prettier-ignore-end -->

Once the vanilla `time-sync` package has been installed, you can get started like so:

```ts
// setupFile.ts
import { TimeSync } from "@buenos-nachos/time-sync";

// TimeSync tries to have sensible defaults, but an options object can be passed
// to the constructor to configure behavior.
export const sync = new TimeSync();
```

```ts
// consumingFile.ts
import { refreshRates } from "@buenos-nachos/time-sync";
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
	onUpdate: (newDate) => {
		console.log(`The seconds is now ${newDate.getSeconds()}`);
	},
});

// Once a subscriber leaves, TimeSync automatically re-calculates the fastest
// interval, and makes sure not to restart the interval from scratch. Let's say
// this unsubscribe happens 45 seconds after the last update. Subscriber 1 will
// be updated in 4 minutes and 15 seconds, rather than in five minutes.
unsubscribe2();

// If we were to call this, there would be no subscribers, and no need for an
// active interval, so TimeSync automatically clears the interval. Calling any
// unsubscribe callback more than once always results in a no-op.
unsubscribe1();

// The ReadonlyDate class is fully assignable to the native date class, to
// maximize interoperability with existing JavaScript libraries. Any function
// that takes a native date as input works with onUpdate out of the box.
function displayYear(date: Date): void {
	// When used with TimeSync's onUpdate property, both of these runtime
	// checks will evaluate to true
	if (date instanceof ReadonlyDate) {
		console.log("Received ReadonlyDate at runtime");
	}
	if (date instanceof Date) {
		console.log(`The year is ${newDate.getYear()}`);
	}
}

const unsubscribe3 = sync.subscribe({
	// This lets a subscriber "passively" subscribe to the TimeSync. It does not
	// trigger updates on its own, but it can be notified when other subscribers
	// change so that it can be "kept in the loop". If all subscribers use this
	// interval, no updates will ever be dispatched.
	targetRefreshIntervalMs: refreshRates.idle,
	onUpdate: displayYear,
});

// Let's say that five seconds have passed since the last update, and then this
// subscription gets added
const unsubscribe4 = sync.subscribe({
	// If a new subscription is added that has an interval less than or equal to
	// the elapsed time since the last update, all subscribers will be notified
	// immediately. Afterwards, a new subscription cycle will start with the
	// fastest interval among all subscribers
	targetRefreshIntervalMs: refreshRates.oneSecond,

	// If the same function (by reference) is added by multiple subscribers,
	// TimeSync will automatically de-duplicate the function calls when
	// dispatching updates. This behavior can be turned off when configuring
	// the instance.
	onUpdate: displayYear,
});

// This lets you pull an immutable snapshot of the TimeSync's inner state. The
// immutability is enforced at runtime and at the type level.
const snap = sync.getStateSnapshot();

// This clears out all subscribers and clears the active interval. This is
// useful for making sure a TimeSync can be garbage-collected without memory
// leaks, but it can also be used to reset a global TimeSync between test runs
sync.clearAll();
```

## Documentation

<!-- prettier-ignore-start -->
> [!NOTE]
> Because this project is in its early stages, there is a bigger risk of breaking API changes. API reference documentation is on the short-term roadmap, but other documentation (such as how-to guides and explanations) will only become available once the project has stabilized.
>
> It is not planned for any packages to enter v1.0.0 until all major features on the roadmap have been implemented and battle-tested by users.
<!-- prettier-ignore-end -->

## Design goals

- Help synchronize state and processes on the same system.
- Make it easy to stop snapshot tests without having to lean on platform-specific tools and hacks.
- Provide limited support for server-side rendering (just enough to avoid hydration mismatches and similar issues as a one-time initialization).
- Provide limited support for stateful servers that need the vanilla JavaScript version of TimeSync to keep updates in sync.

### Non-goals

These items have been deemed fully out of scope for this project, and will never be added to this repo.

- Help synchronize state across multiple devices (no multiplayer support, no extended communication between client and server)

## Contributing

You can find [the contributing guide here](./CONTRIBUTING.md).

## Roadmap

### In active development

1. Add initial bindings for React (supporting Single-Page Applications only)
2. Add basic how-to documentation for how to set up the React bindings for common use cases
3. Update vanilla and React packages as necessary to support Astro while avoiding hydration problems.

### Want to implement (roughly ordered by priority)

1. Start auto-generating API reference documentation
2. Add bindings for Solid.js
3. Tighten up CI process
4. Improve support for mixing bindings for multiple frameworks together in Astro
5. Improve open-source contribution and development experience
6. Add support for using React and Solid.js bindings in popular meta-frameworks that use Server-Side Rendering (TanStack Start, Solid Start, React Router v7, Next.js App Router)
7. Research updating the React bindings to support React Native
8. Beef up documentation once packages seem to be more stable (add explanations, how-to guides, etc.)

### Want to implement (blocked)

1. Add support for `Temporal` objects (need to wait for browser implementations to stabilize and user adoption to be much higher)

### Considering (unordered)

- Add bindings for the various other UI frameworks (Svelte, Vue, Angular, Qwik, Lit, etc.). Some frameworks might require minimal or no bindings.
