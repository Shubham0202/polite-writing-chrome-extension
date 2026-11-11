const PRIVACY_POINTS = [
  'Suggestions on websites are worked out on this computer. A LanguageTool server on this computer is only asked once you turn it on above.',
  "Fix Grammar and Fix Everything in the popup send the text to LanguageTool's online service while Online grammar check is on, which it is until you turn it off in the popup.",
  'After you add your own API key, text goes to your AI provider only when you press Rewrite with AI, or use Ctrl+Shift+Space with its AI switch on.',
  'Checks as you type never use an online service or an AI.',
  'Password, payment and one-time-code fields are never read.',
  "Only these settings, your API keys and your ignored words are saved, in Chrome's extension storage on this computer. Your messages are not saved.",
  'If you open Settings from the popup, the text in the popup is kept in memory until the popup opens again, then deleted. Closing Chrome deletes it too.',
]

const PrivacySummary = () => (
  <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-slate-700 dark:text-neutral-200">
    {PRIVACY_POINTS.map((point) => (
      <li key={point}>{point}</li>
    ))}
  </ul>
)

export default PrivacySummary
