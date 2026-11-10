const PRIVACY_POINTS = [
  'By default, suggestions are worked out on this computer. A LanguageTool server you run yourself also stays on this computer.',
  'Your text only leaves this computer if you turn on Online grammar check in the popup, and then only when you press Fix Grammar or Fix Everything, or, after adding your own API key, if you press Rewrite with AI or use Ctrl+Shift+Space with its AI switch on.',
  'Checks as you type never use an online service or an AI.',
  'Password, payment and one-time-code fields are never read.',
  "Only these settings, your API key and your ignored words are saved, in Chrome's extension storage on this computer. Your messages are not stored.",
]

const PrivacySummary = () => (
  <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-slate-700 dark:text-neutral-200">
    {PRIVACY_POINTS.map((point) => (
      <li key={point}>{point}</li>
    ))}
  </ul>
)

export default PrivacySummary
