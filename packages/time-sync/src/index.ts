// Not using wildcard syntax to make final exported dependencies more obvious.
// There's not that many of them, so clarity is more important than saving on
// extra keystrokes.
export { newReadonlyDate } from "./readonlyDate";
export {
	type InitOptions,
	type InvalidateStateOptions,
	refreshRates,
	type Snapshot,
	type SubscriptionHandshake,
	TimeSync,
} from "./TimeSync";
