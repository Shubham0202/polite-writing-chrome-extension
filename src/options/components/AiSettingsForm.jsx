import Button from '../../components/Button.jsx'
import Select from '../../components/Select.jsx'
import { AI_PROVIDERS, AI_PROVIDER_DEFAULT_MODEL, AI_PROVIDER_KEY_URL, AI_PROVIDER_LABEL, AI_PROVIDER_SUGGESTED_MODELS } from '../../constants/ai.js'
import { FORM_STATUS, useAiSettingsForm } from '../hooks/useAiSettingsForm.js'

const MODEL_SUGGESTIONS_ID = 'ai-model-suggestions'

const INPUT_CLASS = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none'

const STATUS_MESSAGE = {
  [FORM_STATUS.idle]: () => null,
  [FORM_STATUS.saved]: (provider) => `Saved. Rewrite with AI in the popup now uses ${AI_PROVIDER_LABEL[provider]}.`,
  [FORM_STATUS.removed]: () => 'The API key was removed. Rewrite with AI is off until you add one.',
}

const Field = ({ id, label, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-medium text-slate-700">
      {label}
    </label>
    {children}
  </div>
)

const AiSettingsForm = ({ stored }) => {
  const { form, error, status, update, save, remove } = useAiSettingsForm(stored)
  const statusMessage = STATUS_MESSAGE[status](form.provider)
  const suggestedModels = AI_PROVIDER_SUGGESTED_MODELS[form.provider]
  const hasSuggestions = suggestedModels.length > 0

  const handleSubmit = (event) => {
    event.preventDefault()
    save()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field id="ai-provider" label="Provider">
        <div className="flex items-center gap-3">
          {/* Model names are provider-specific, so a switched provider starts from its default, shown as the placeholder. */}
          <Select id="ai-provider" className="py-2" value={form.provider} onChange={(event) => update({ provider: event.target.value, model: '' })}>
            {Object.values(AI_PROVIDERS).map((provider) => (
              <option key={provider} value={provider}>
                {AI_PROVIDER_LABEL[provider]}
              </option>
            ))}
          </Select>
          <a href={AI_PROVIDER_KEY_URL[form.provider]} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline">
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
          onChange={(event) => update({ apiKey: event.target.value })}
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
          onChange={(event) => update({ model: event.target.value })}
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
        <p className="text-xs text-slate-500">
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
        <p role="alert" className="text-xs text-rose-700">
          {error.message}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="text-xs text-emerald-800">
          {statusMessage}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Rewrite with AI sends the text in the popup to {AI_PROVIDER_LABEL[form.provider]} only when you press that button. With the switch below on,
        Ctrl+Shift+Space does the same for the field you are typing in on a website. Checks as you type never use it. The key is stored in
        Chrome&apos;s extension storage on this computer; Remove key deletes it.
      </p>
    </form>
  )
}

export default AiSettingsForm
