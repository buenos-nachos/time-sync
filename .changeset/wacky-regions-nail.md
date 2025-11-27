---
"@buenos-nachos/time-sync": minor
---

## Breaking

- Changed the default value of `allowDuplicateFunctionCalls` to `true` instead of `false`

## Features

- Added second parameter to `onUpdate` callback. This value is a value of type `SubscriptionContext` and provides information about the current subscription.
