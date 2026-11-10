const isOwnKey = <Table extends object>(table: Table, key: PropertyKey): key is keyof Table => Object.hasOwn(table, key)

// Reads a table with a key that comes from user text or another service, such as a message type or an HTTP status.
// Plain objects would otherwise return inherited members, so the word "constructor" would find Object's constructor.
export const lookup = <Table extends object>(table: Table, key: unknown): Table[keyof Table] | undefined =>
  (typeof key === 'string' || typeof key === 'number') && isOwnKey(table, key) ? table[key] : undefined
