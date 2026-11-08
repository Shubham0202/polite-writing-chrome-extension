// Applies edits from the end of the text backwards so earlier offsets stay valid. Of two edits at the same offset the
// longer goes first, so an insertion lands before the text a neighbouring replacement has just changed.
export const applyEdits = (text, edits) =>
  [...edits]
    .sort((first, second) => second.offset - first.offset || second.length - first.length)
    .reduce(
      (result, { offset, length, replacement }) =>
        result.slice(0, offset) + replacement + result.slice(offset + length),
      text,
    )

const isOverlapping = (first, second) =>
  first.offset < second.offset + second.length && second.offset < first.offset + first.length

// Keeps the best-ranked item wherever spans overlap; `rank` returns a lower number for higher priority.
export const removeOverlaps = (items, rank) =>
  [...items]
    .sort((first, second) => rank(first) - rank(second))
    .reduce((kept, item) => (kept.some((keptItem) => isOverlapping(keptItem, item)) ? kept : [...kept, item]), [])
    .sort((first, second) => first.offset - second.offset)
