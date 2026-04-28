export function isWellFormedEntry(entry: unknown): entry is [IDBValidKey, unknown] {
  // Corrupted or mocked IndexedDB walks can surface missing tuple entries;
  // guard before destructuring entry[0]/entry[1] so one bad row cannot crash local flows.
  return Array.isArray(entry) && entry.length >= 2;
}
