export const onStorageValueChanged = (key, listener) => {
  const handleChange = (changes, area) => {
    if (area === 'local' && changes[key]) listener(changes[key].newValue, changes[key].oldValue)
  }
  chrome.storage.onChanged.addListener(handleChange)
  return () => chrome.storage.onChanged.removeListener(handleChange)
}
