# time-sync

<!-- prettier-ignore-start -->
[![AGPL-3 License](https://img.shields.io/github/license/buenos-nachos/time-sync.svg?color=slateblue)](https://github.com/buenos-nachos/time-sync/blob/main/LICENSE) 
[![CI/CD](https://github.com/buenos-nachos/time-sync/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/buenos-nachos/time-sync/actions/workflows/ci.yaml)
<!-- prettier-ignore-end -->

[time-sync logo](./images/banner.png)

`time-sync` is a set of packages designed to make it foolproof to work with time values on a single device. This can be multiple UI components on a single client device, or a series of UI snapshot tests being run in a platform like Storybook. While `time-sync` is mostly intended for UIs, the vanilla version also has zero dependencies and can be used for stateful servers. The packages force you as a developer to specify when and how time should be updated, while also centralizing updates to a single place.

In other words, the goal of `time-sync` is to make time more obvious and less magical.

See [the motiviation section](#motivation) for more information.

## Features

### Available now

- 🔄 **Keep things in sync** – `time-sync` ensures that different systems on one device can't ever get out of sync with each other.
- 📸 **No more snapshot flakes** – `time-sync` makes it easy to freeze the time to a specific value to ensure that your snapshot tests stay deterministic.
- 🏝️ **Astro islands** – All `time-sync` packages aim to support Astro's island architecture out of the box. This includes mixing `.astro` files with UI frameworks that have official `time-sync` packages.
- 📦 **As few dependencies as possible** – The vanilla version of `time-sync` has zero runtime dependencies. Each package for binding it to a framwork aims to have only that framework as a dependency.

### Coming soon

- 🖥️ **Bindings for popular UI frameworks** – `time-sync` will be launching bindings for React in the next few weeks. Solid.js bindings will launch soon after. Other frameworks may be added based on demand/interest.
- 💿 **Mix and match UI frameworks** – The React and Solid.js packages are being designed so that they can be used together in a single Astro project. Any future framework bindings will aim to have the same support.

## Quick start

### Installation

### Usage

## Documentation

All documentation can be found [in the `docs` directory](./docs).

<!-- prettier-ignore-start -->
> [!NOTE]
> Because this project is in its early stages, there is a bigger risk of breaking API changes. Other documentation (such as how-to guides and explanations) will become available once the project has stabilized.
<!-- prettier-ignore-end -->

## Motivation

### Design goals

- Help synchronize state and processes on the same system.
- Make it easy to stop snapshot tests without having to lean on platform-specific tools and hacks.
- Provide limited support for server-side rendering (just enough to avoid hydration mismatches and similar issues as a one-time initialization).
- Provide limited support for stateful servers that need the vanilla JavaScript version of TimeSync to keep updates in sync.

### Design non-goals

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
