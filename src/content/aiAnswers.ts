import type { RewriteStyle } from '../constants/ai.ts'
import type { IdentifiedSuggestion } from '../engines/suggestion.ts'
import type { RewriteEngineReport, RewriteResult } from '../services/writingEnhancer.ts'

const READY_MESSAGE = 'AI rewrite ready.'
const EARLIER_MESSAGE = 'Showing the earlier AI rewrite of this text.'
const NOTHING_LEFT_MESSAGE = 'No AI changes left to review.'

// The AI's last answer for a field, kept so that opening the list again for the same text costs no new request.
// `texts` holds every text the answer still describes: the one the AI saw, and those reached from it with Accept or
// Undo on the card. Typing leads to other texts, and then the AI is asked again.
export interface AiAnswer {
  text: string
  style: RewriteStyle | null
  suggestions: IdentifiedSuggestion[]
  message: string | null
  texts: Set<string>
}

export interface AiAnswerKey {
  text: string
  style: RewriteStyle | null
}

export interface AiAnswerDescription {
  isEarlier: boolean
  visibleCount: number
  message: string | null
}

// Only what the answer keeps from the service's reply.
export interface AiAnswerSource extends Pick<RewriteResult, 'suggestions'> {
  engines?: Pick<RewriteEngineReport, 'message'>[]
}

export const createAiAnswer = ({ text, style, result }: AiAnswerKey & { result: AiAnswerSource }): AiAnswer => ({
  text,
  style,
  suggestions: result.suggestions,
  message: result.engines?.[0]?.message ?? null,
  texts: new Set([text]),
})

// Another style is another question, so it is not answered from memory.
export const isAnswerFor = (answer: AiAnswer | undefined, { text, style }: AiAnswerKey): answer is AiAnswer =>
  Boolean(answer) && answer!.style === style && answer!.texts.has(text)

// A change made on the card keeps the answer current, as long as the answer still described the text before it.
export const followCardChange = (answer: AiAnswer | undefined, before: string, after: string): AiAnswer | undefined =>
  answer?.texts.has(before) ? { ...answer, texts: new Set([...answer.texts, after]) } : answer

export const describeAiAnswer = ({ isEarlier, visibleCount, message }: AiAnswerDescription): string => {
  const parts = [isEarlier ? EARLIER_MESSAGE : null, message ?? (visibleCount > 0 ? null : NOTHING_LEFT_MESSAGE)].filter(Boolean)
  return parts.length ? parts.join(' ') : READY_MESSAGE
}
