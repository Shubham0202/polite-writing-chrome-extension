import { CORRECTION_ACTIONS } from '../constants/corrections.js'
import { createLatestRunner } from './latestRunner.js'

// Runs one check per sender at a time: a newer check replaces the older one, whose LanguageTool request is aborted.
export const createInlineCheckRunner = (runCorrectionPipeline) =>
  createLatestRunner((signal, text) => runCorrectionPipeline({ text, action: CORRECTION_ACTIONS.inlineCheck, signal }))
