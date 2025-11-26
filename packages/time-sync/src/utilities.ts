export type Writeable<T> = { -readonly [Key in keyof T]: T[Key] };
