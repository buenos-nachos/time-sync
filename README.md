# time-sync

Library for centralizing time values into reactive, dependency-injectable state.

## Design goals

By design, TimeSync helps you keep different systems in sync – as long as they are all on the same device. It is an explicit non-goal to

## Roadmap

### In active development

- Add bindings for traditional, client-rendered React

### Want to implement (roughly ordered by priority)

1. Add support for mixing React bindings with client-side Astro files
2. Add support for server-side rendering to React bindings
3. Add bindings for Solid.js
4. Improve support for mixing multiple frameworks together
5. Add support for `Temporal` objects (once the browser implementations have stabilized and browser adoption is much higher)

### Considering

- Add bindings for Svelte
- Add bindings for Vue
- Add bindings for Angular
