import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import Button from '../../components/Button.tsx'
import Select from '../../components/Select.tsx'
import { AI_PROVIDERS, AI_PROVIDER_DEFAULT_MODEL, AI_PROVIDER_KEY_URL, AI_PROVIDER_LABEL, AI_PROVIDER_SUGGESTED_MODELS, type AiProvider, type AiSettings } from '../../constants/ai.ts'
import { FORM_STATUS, useAiSettingsForm, type FormStatus } from '../hooks/useAiSettingsForm.ts'

const MODEL_SUGGESTIONS_ID = 'ai-model-suggestions'

const INPUT_CLASS =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none dark:border-neutral-600 dark:focus:ring-brand-500/30'

const STATUS_MESSAGE: Record<FormStatus, (provider: AiProvider) => string | null> = {
  [FORM_STATUS.idle]: () => null,
  [FORM_STATUS.saved]: (provider: AiProvider) => `Saved. Rewrite with AI in the popup now uses ${AI_PROVIDER_LABEL[provider]}.`,
  [FORM_STATUS.removed]: () => 'The API key was removed. Rewrite with AI is off until you add one.',
}

interface FieldProps {
  id: string
  label: string
  children: ReactNode
}

const Field = ({ id, label, children }: FieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-neutral-200">
      {label}
    </label>
    {children}
  </div>
)

interface AiSettingsFormProps {
  stored: AiSettings
}

const AiSettingsForm = ({ stored }: AiSettingsFormProps) => {
  const { form, error, status, update, save, remove } = useAiSettingsForm(stored)
  const statusMessage = STATUS_MESSAGE[status](form.provider)
  const suggestedModels = AI_PROVIDER_SUGGESTED_MODELS[form.provider]
  const hasSuggestions = suggestedModels.length > 0

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field id="ai-provider" label="Provider">
        <div className="flex items-center gap-3">
          {/* Model names are provider-specific, so a switched provider starts from its default, shown as the placeholder. */}
          <Select id="ai-provider" className="py-2" value={form.provider} onChange={(event: ChangeEvent<HTMLSelectElement>) => update({ provider: event.target.value as AiProvider, model: '' })}>
            {Object.values(AI_PROVIDERS).map((provider) => (
              <option key={provider} value={provider}>
                {AI_PROVIDER_LABEL[provider]}
              </option>
            ))}
          </Select>
          <a href={AI_PROVIDER_KEY_URL[form.provider]} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline dark:text-brand-300">
            Get an API key
          </a>
        </div>
      </Field>
      <Field id="ai-api-key" label="API key">
        <input
          id="ai-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={form.apiKey}
          onChange={(event: ChangeEvent<HTMLInputElement>) => update({ apiKey: event.target.value })}
          placeholder="Paste your key"
          aria-invalid={error?.field === 'apiKey'}
          className={INPUT_CLASS}
        />
      </Field>
      <Field id="ai-model" label="Model">
        <input
          id="ai-model"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={form.model}
          onChange={(event: ChangeEvent<HTMLInputElement>) => update({ model: event.target.value })}
          placeholder={`${AI_PROVIDER_DEFAULT_MODEL[form.provider]} (default)`}
          list={hasSuggestions ? MODEL_SUGGESTIONS_ID : undefined}
          aria-invalid={error?.field === 'model'}
          className={INPUT_CLASS}
        />
        {hasSuggestions && (
          <datalist id={MODEL_SUGGESTIONS_ID}>
            {suggestedModels.map((model) => (
              <option key={model} value={model} label={model === AI_PROVIDER_DEFAULT_MODEL[form.provider] ? 'Default' : undefined} />
            ))}
          </datalist>
        )}
        <p className="text-xs text-slate-500 dark:text-neutral-400">
          {hasSuggestions ? 'Leave empty to use the default model, or click the field to pick a suggested free model.' : 'Leave empty to use the default model.'}
        </p>
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        {stored.apiKey && (
          <Button variant="ghost" onClick={remove}>
            Remove key
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
          {error.message}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="text-xs text-emerald-800 dark:text-emerald-300">
          {statusMessage}
        </p>
      )}
      <p className="text-xs text-slate-500 dark:text-neutral-400">
        Rewrite with AI sends the text in the popup to {AI_PROVIDER_LABEL[form.provider]} only when you press that button. With the switch below on,
        Ctrl+Shift+Space does the same for the field you are typing in on a website. Checks as you type never use it. The key is stored in
        Chrome&apos;s extension storage on this computer; Remove key deletes it.
      </p>
    </form>
  )
}

export default AiSettingsForm
