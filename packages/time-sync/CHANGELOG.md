# @buenos-nachos/time-sync

## 0.6.2

### Patch Changes

- 7a2903c: reduced memory usage and allocations for internal methods

## 0.6.1

### Patch Changes

- 03c41c8: removed internal comments from NPM output

## 0.6.0

### Minor Changes

- 8678493: Removed support for CommonJS. Also removed source files, changelog, and sourcemaps from output packages.

## 0.5.5

### Patch Changes

- 1862a8b: Added explicit build process when preparing NPM scripts to ensure ./dist files can't be omitted

## 0.5.4

### Patch Changes

- 3f130f1: updated `files` in package.json to include accidentally removed files

## 0.5.3

### Patch Changes

- e401ae4: further updated which files are included in NPM packages

## 0.5.2

### Patch Changes

- a2a6843: Removed test files from NPM builds.

## 0.5.1

### Patch Changes

- 5fdc201: Updated wording on `Snapshot.date` to be less misleading.

## 0.5.0

### Breaking Changes

- c3986e9: revamped all state management and APIs to be based on monotonic time
- c3986e9: Removed `registeredAt` and `intervalLastFulfilledAt` properties from `SubscriptionContext` and added monotonic `registeredAtMs`
- c3986e9: Added monotonic `lastUpdatedAt` property to `Snapshot` type.

## 0.4.1

### Patch Changes

- 5f37f1a: refactored class to remove private setSnapshost method

## 0.4.0

### Breaking Changes

- 663479e: Removed `isSubscribed` property from context and made all other context properties readonly.

## 0.3.2

### Patch Changes

- b8fbaf8: cleanup up comments and types for exported class, methods, and types.

## 0.3.1

### Patch Changes

- 5fce018: switched internal implementations to use Date.now more often to reduce memory usage

## 0.3.0

### Breaking Changes

- 122f6c1: Updated `SubscriptionContext.timeSync` type to be readonly and non-nullable, and renamed `SubscriptionContext.isLive` to `SubscriptionContext.isSubscribed`.

## 0.2.0

### Breaking Changes

- 2f527dd: Changed the default value of `allowDuplicateFunctionCalls` from `false` to `true`

### Minor Changes

- 5f86fac: Added second parameter to `onUpdate` callback. This value is a value of type `SubscriptionContext` and provides information about the current subscription.

## 0.1.2

### Patch Changes

- 6189eb2: add README to root directory

## 0.1.1

### Patch Changes

- f18d71c: fix: specified module type as ESM

## 0.1.0

### Minor Changes

- 8be4b26: Initial release
