// Reads a table with a key that comes from user text or another service. Plain objects would otherwise
// return inherited members, so the word "constructor" would find Object's constructor function.
export const lookup = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined)
