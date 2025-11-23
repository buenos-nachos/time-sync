# time-sync

`time-sync` is a set of packages designed to make it more foolproof to work with time values on a single device. This can be multiple UI components on a single client device, or a series of snapshot tests being run in a platform like Storybook. While `time-sync` ismostly intended for UIs, the vanilla version also has zero dependencies and can be used for stateful servers. The packages force you as a developer to specify when and how time should be updated, and they centralize all dependencies in a single place.

In other words, the goal of `time-sync` is to make time more obvious and less magical.

See [the motiviation section](#motivation) for more information.

## Features

## Quick start

## Motivation

### Design goals

- Help synchronize state and processes on the same system
- Provide limited support for server-side rendering (just enough to avoid hydration mismatches and similar issues, but no deep synchronization).
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
5. Beef up documentation once packages seem to be more stable (add explanations, how-to guides, etc.)
6. Add support for using React and Solid.js bindings in popular meta-frameworks that use Server-Side Rendering (TanStack Start, Solid Start, React Router v7, Next.js App Router)

### Want to implement (blocked)

1. Add support for `Temporal` objects (need to wait for browser implementations to stabilize and user adoption to be much higher)

### Considering (unordered)

- Add bindings for the various other UI frameworks (Svelte, Vue, Angular, Qwik, Lit, etc.). Some frameworks might require minimal or no bindings.
