# time-sync

Library for centralizing time values into reactive, dependency-injectable state.

## Design goals

### Goals

- Help synchronize state and processes on the same system
- Provide limited support for server-side rendering (just enough to avoid hydration mismatches and similar issues, but no deep synchronization)

### Non-goals

- Help synchronize state across multiple client devices (which introduces time zone issues)
- Help synchronize state across multiple the server and client for extended periods of time

## Roadmap

### In active development

1. Add bindings for traditional, client-rendered React

### Want to implement (roughly ordered by priority)

1. Add support for mixing React bindings with client-side Astro files
2. Add support for server-side rendering to React bindings
3. Add bindings for Solid.js
4. Improve support for mixing multiple frameworks together

### Want to implement (blocked)

1. Add support for `Temporal` objects (need to wait for browser implementations to stabilize and user adoption to be much higher)

### Considering (unordered)

- Add bindings for Svelte
- Add bindings for Vue
- Add bindings for Angular
