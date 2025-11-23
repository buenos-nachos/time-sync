# time-sync

Take control of time and stop it from wreaking havoc in your codebases.

## Design goals

### Goals

- Help synchronize state and processes on the same system
- Provide limited support for server-side rendering (just enough to avoid hydration mismatches and similar issues, but no deep synchronization).
- Provide limited support for stateful servers that need the vanilla version of TimeSync to keep updates in sync.

### Non-goals

- Help synchronize state across multiple devices (no multiplayer support, no extended communication between client and server)

## Roadmap

### In active development

1. Add initial bindings for React (supporting Single-Page Applications and Astro islands)

### Want to implement (roughly ordered by priority)

1. Add bindings for Solid.js
2. Improve support for mixing bindings for multiple frameworks together in Astro
3. Beef up documentation once packages seem to be more stable (add explanations, how-to guides, etc.)
4. Add support for using React and Solid.js bindings in popular meta-frameworks that use Server-Side Rendering (TanStack Start, Solid Start, React Router v7, Next.js App Router)

### Want to implement (blocked)

1. Add support for `Temporal` objects (need to wait for browser implementations to stabilize and user adoption to be much higher)

### Considering (unordered)

- Add bindings for Svelte
- Add bindings for Vue
- Add bindings for Angular
