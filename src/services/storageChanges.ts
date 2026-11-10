export const onStorageValueChanged = <StoredValue>(
  key: string,
  listener: (newValue: StoredValue | undefined, oldValue: StoredValue | undefined) => void,
): (() => void) => {
  const handleChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[key]) listener(changes[key].newValue as StoredValue | undefined, changes[key].oldValue as StoredValue | undefined)
  }
  chrome.storage.onChanged.addListener(handleChange)
  return () => chrome.storage.onChanged.removeListener(handleChange)
}
