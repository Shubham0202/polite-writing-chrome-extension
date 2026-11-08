const READY_MESSAGE = 'AI rewrite ready.'
const EARLIER_MESSAGE = 'Showing the earlier AI rewrite of this text.'
const NOTHING_LEFT_MESSAGE = 'No AI changes left to review.'

// The AI's last answer for a field, kept so that opening the list again for the same text costs no new request.
// `texts` holds every text the answer still describes: the one the AI saw, and those reached from it with Accept or
// Undo on the card. Typing leads to other texts, and then the AI is asked again.
export const createAiAnswer = ({ text, style, result }) => ({
  text,
  style,
  suggestions: result.suggestions,
  message: result.engines?.[0]?.message ?? null,
  texts: new Set([text]),
})

// Another style is another question, so it is not answered from memory.
export const isAnswerFor = (answer, { text, style }) => Boolean(answer) && answer.style === style && answer.texts.has(text)

// A change made on the card keeps the answer current, as long as the answer still described the text before it.
export const followCardChange = (answer, before, after) =>
  answer?.texts.has(before) ? { ...answer, texts: new Set([...answer.texts, after]) } : answer

export const describeAiAnswer = ({ isEarlier, visibleCount, message }) => {
  const parts = [isEarlier ? EARLIER_MESSAGE : null, message ?? (visibleCount > 0 ? null : NOTHING_LEFT_MESSAGE)].filter(Boolean)
  return parts.length ? parts.join(' ') : READY_MESSAGE
}
