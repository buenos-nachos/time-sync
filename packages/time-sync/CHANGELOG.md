# @buenos-nachos/time-sync

## 0.3.0

### Minor Changes

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
