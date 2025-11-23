# time-sync

Take control of time and stop it from wreaking havoc in your codebases.

## Design goals

### Goals

- Help synchronize state and processes on the same system
- Provide limited support for server-side rendering (just enough to avoid hydration mismatches and similar issues, but no deep synchronization).
- Provide limited support for stateful servers that need the vanilla JavaScript version of TimeSync to keep updates in sync.

### Non-goals

- Help synchronize state across multiple devices (no multiplayer support, no extended communication between client and server)

## Contributing

You can find [the contributing guide here](./CONTRIBUTING.md).

## Roadmap

### In active development

1. Add initial bindings for React (supporting Single-Page Applications and Astro islands)

### Want to implement (roughly ordered by priority)

1. Improve open-source contribution and development experience
2. Add bindings for Solid.js
3. Improve support for mixing bindings for multiple frameworks together in Astro
4. Beef up documentation once packages seem to be more stable (add explanations, how-to guides, etc.)
5. Add support for using React and Solid.js bindings in popular meta-frameworks that use Server-Side Rendering (TanStack Start, Solid Start, React Router v7, Next.js App Router)

### Want to implement (blocked)

1. Add support for `Temporal` objects (need to wait for browser implementations to stabilize and user adoption to be much higher)

### Considering (unordered)

- Add bindings for Svelte
- Add bindings for Vue
- Add bindings for Angular
