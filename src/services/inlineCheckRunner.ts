import { CORRECTION_ACTIONS } from '../constants/corrections.ts'
import type { InlineCheckRequest, InlineCheckResult } from './correctionPipeline.ts'
import { createLatestRunner, type LatestRunner } from './latestRunner.ts'

// Runs one check per sender at a time: a newer check replaces the older one, whose LanguageTool request is aborted.
// The runner always supplies the signal, so the pipeline it calls can rely on it.
export type InlineCheckPipeline = (request: InlineCheckRequest & { signal: AbortSignal }) => Promise<InlineCheckResult>

export const createInlineCheckRunner = (runCorrectionPipeline: InlineCheckPipeline): LatestRunner<[text: string], InlineCheckResult> =>
  createLatestRunner((signal: AbortSignal, text: string) => runCorrectionPipeline({ text, action: CORRECTION_ACTIONS.inlineCheck, signal }))
