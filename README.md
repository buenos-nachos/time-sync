# time-sync

<!-- prettier-ignore-start -->
[![AGPL-3 License](https://img.shields.io/github/license/buenos-nachos/time-sync.svg?color=slateblue)](https://github.com/buenos-nachos/time-sync/blob/main/LICENSE) 
[![CI/CD](https://github.com/buenos-nachos/time-sync/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/buenos-nachos/time-sync/actions/workflows/ci.yaml)
<!-- prettier-ignore-end -->

![time-sync logo](./images/banner.png)

`time-sync` is a set of packages designed to make it foolproof to work with time values on a single device. This can be multiple UI components on a single client device, or a series of UI snapshot tests being run in a platform like Storybook. While `time-sync` is mostly intended for UIs, the vanilla version also has zero dependencies and can be used for stateful servers. The packages force you as a developer to specify when and how time should be updated, while also centralizing updates to a single place.

In other words, the goal of `time-sync` is to make time more obvious and less magical.

## Features

- 🔄 **Keep things in sync** – `time-sync` ensures that different systems on one device can't ever get out of sync with each other.
- 📸 **No more snapshot flakes** – `time-sync` makes it easy to freeze the time to a specific value to ensure that your snapshot tests stay deterministic. The upcoming UI framework bindings will have out-of-the-box support for platforms like Storybook.
- 🏝️ **Astro islands** – All `time-sync` packages aim to support Astro's island architecture out of the box. This includes mixing `.astro` files with UI frameworks that have official `time-sync` packages.
- 📦 **As few dependencies as possible** – The vanilla version of `time-sync` has zero runtime dependencies. Each package for binding it to a framework aims to have only that framework as a dependency.

### Coming soon

- 🖥️ **Bindings for popular UI frameworks** – `time-sync` will be launching bindings for React in the next few weeks. Solid.js bindings will launch soon after. Other frameworks may be added based on demand/interest.
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
> While the `TimeSync` class is designed to be instantiated any number of times (especially for testing), it is HIGHLY recommended that each device only ever have one instance at a time. Treat it how you would a global Redux store. 
<!-- prettier-ignore-end -->

Once the vanilla `time-sync` package has been installed, you can get started like so:

```ts
// Setup file
import { TimeSync } from "@buenos-nachos/time-sync";

// TimeSync tries to have sensible defaults, but an options object can be passed
// to the constructor to configure behavior.
export const sync = new TimeSync();
```

```ts
// Consuming file
import { refreshRates } from "@buenos-nachos/time-sync";
import { sync } from "./setupFile";

const unsubscribe1 = sync.subscribe({
	// refreshRates contains a set of commonly-used intervals, but any positive
	// integer can be used as well
	targetRefreshIntervalMs: refreshRates.fiveMinutes,
	onUpdate: (newDate) => {
		console.log(`The new date is ${newDate.toDateString()}`);
	},
});

// All subscribers are automatically updated by the fastest interval currently
// active among all subscriptions
const unsubscribe2 = sync.subscribe({
	targetRefreshIntervalMs: refreshRates.oneMinute,
	onUpdate: (newDate) => {
		console.log(`The seconds is now ${newDate.getSeconds()}`);
	},
});

// Once a subscriber leaves, TimeSync automatically re-calculates the fastest
// interval. Let's say that this happens 45 seconds after the last update.
// Subscriber 1 will be updated in 4 minutes and 15 seconds, rather than in
// five minutes. The timer does not start over from scratch as long as there is
// an active subscriber.
unsubscribe2();

function displayYear(date: Date): void {
	console.log(`The year is ${newDate.getYear()}`);
}

const unsubscribe3 = sync.subscribe({
	// This lets a subscriber "passively" subscribe to the TimeSync. It does not
	// trigger updates on its own, but it can be notified when other subscribers
	// change so that it can be "kept in the loop".
	targetRefreshIntervalMs: refreshRates.idle,
	onUpdate: displayYear,
});

const unsubscribe4 = sync.subscribe({
	// If a new subscription is added that has an interval less than or equal to
	// the elapsed time since the last update, all subscribers will be notified
	// immediately, and then the update cycle will resume as normal.
	targetRefreshIntervalMs: refreshRates.oneSecond,

	// If the same function (by reference) is added by multiple subscribers,
	// TimeSync will automatically de-duplicate the function calls when
	// dispatching updates. This behavior can be turned off when configuring
	// the instance.
	onUpdate: displayYear,
});

// This lets you pull an immutable snapshot of the TimeSync's inner state
const snap = sync.getStateSnapshot();
```

## Documentation

All documentation can be found [in the `docs` directory](./docs).

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

1. Add initial bindings for React (supporting Single-Page Applications and Astro islands)

### Want to implement (roughly ordered by priority)

1. Start auto-generating documentation (was skipped to get the MVP version of the library published sooner)
2. Add bindings for Solid.js
3. Improve support for mixing bindings for multiple frameworks together in Astro
4. Improve open-source contribution and development experience
5. Research updating the React bindings to support React Native
6. Beef up documentation once packages seem to be more stable (add explanations, how-to guides, etc.)
7. Add support for using React and Solid.js bindings in popular meta-frameworks that use Server-Side Rendering (TanStack Start, Solid Start, React Router v7, Next.js App Router)

### Want to implement (blocked)

1. Add support for `Temporal` objects (need to wait for browser implementations to stabilize and user adoption to be much higher)

### Considering (unordered)

- Add bindings for the various other UI frameworks (Svelte, Vue, Angular, Qwik, Lit, etc.). Some frameworks might require minimal or no bindings.
