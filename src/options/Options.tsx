import SwitchField from '../components/SwitchField.tsx'
import type { Theme } from '../constants/settings.ts'
import { useSettings } from '../hooks/useSettings.ts'
import AiSettingsForm from './components/AiSettingsForm.tsx'
import AiShortcutSettings from './components/AiShortcutSettings.tsx'
import DelayField from './components/DelayField.tsx'
import IgnoredWordList from './components/IgnoredWordList.tsx'
import LocalLanguageToolSetting from './components/LocalLanguageToolSetting.tsx'
import PrivacySummary from './components/PrivacySummary.tsx'
import SettingsSection from './components/SettingsSection.tsx'
import ShortcutList from './components/ShortcutList.tsx'
import SiteList from './components/SiteList.tsx'
import ThemeField from './components/ThemeField.tsx'
import { useAiSettings } from './hooks/useAiSettings.ts'
import { useCustomSites } from './hooks/useCustomSites.ts'
import { useIgnoredWords } from './hooks/useIgnoredWords.ts'
import { useShortcuts } from './hooks/useShortcuts.ts'

interface CheckSwitch {
  key: 'isSpellingEnabled' | 'isGrammarEnabled' | 'isPoliteEnabled' | 'isProfessionalEnabled'
  label: string
}

const CHECK_SWITCHES: CheckSwitch[] = [
  { key: 'isSpellingEnabled', label: 'Spelling' },
  { key: 'isGrammarEnabled', label: 'Grammar and tense' },
  { key: 'isPoliteEnabled', label: 'Polite rewrites' },
  { key: 'isProfessionalEnabled', label: 'Professional rewrites' },
]

const Options = () => {
  const { settings, updateSettings } = useSettings()
  const ignoredWords = useIgnoredWords()
  const aiSettings = useAiSettings()
  const shortcuts = useShortcuts()
  const { error, sitesWithoutAccess, addSite, allowAgain, removeSite } = useCustomSites(settings)

  if (!settings) return null

  const handleDelayChange = (delayMs: number) => updateSettings({ delayMs })
  const handleThemeChange = (theme: Theme) => updateSettings({ theme })

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 font-sans text-slate-900 dark:text-neutral-100">
      <header>
        <h1 className="text-lg font-semibold">WriteBetter settings</h1>
        <p className="text-sm text-slate-500 dark:text-neutral-400">These control the suggestions on websites and the optional AI rewriting in the popup. The popup buttons always run every check.</p>
      </header>

      <SettingsSection title="Inline suggestions">
        <SwitchField
          id="setting-isInlineEnabled"
          label="Show suggestions on websites"
          description="Turn off to pause everywhere. The popup has the same switch."
          checked={settings.isInlineEnabled}
          onChange={(isInlineEnabled) => updateSettings({ isInlineEnabled })}
        />
        {CHECK_SWITCHES.map(({ key, label }) => (
          <SwitchField
            key={key}
            id={`setting-${key}`}
            label={label}
            checked={settings[key]}
            disabled={!settings.isInlineEnabled}
            onChange={(isEnabled) => updateSettings({ [key]: isEnabled })}
          />
        ))}
        <DelayField delayMs={settings.delayMs} disabled={!settings.isInlineEnabled} onChange={handleDelayChange} />
        <SwitchField
          id="setting-isCloseOnAcceptEnabled"
          label="Close the suggestion list after Accept"
          description="Accepting an AI rewrite always closes the Ctrl+Shift+Space list. With this on, accepting any suggestion closes it too. The list has the same switch."
          checked={settings.isCloseOnAcceptEnabled}
          disabled={!settings.isInlineEnabled}
          onChange={(isCloseOnAcceptEnabled) => updateSettings({ isCloseOnAcceptEnabled })}
        />
      </SettingsSection>

      <SettingsSection title="Keyboard shortcuts" description="Chrome keeps these separately for each profile.">
        <ShortcutList shortcuts={shortcuts ?? []} />
      </SettingsSection>

      <SettingsSection title="Websites" description="Turn a site off to pause suggestions there.">
        <SiteList
          settings={settings}
          error={error}
          sitesWithoutAccess={sitesWithoutAccess}
          onUpdate={updateSettings}
          onAdd={addSite}
          onAllowAgain={allowAgain}
          onRemove={removeSite}
        />
      </SettingsSection>

      <SettingsSection title="Ignored words" description="Spelling suggestions skip these words, on websites and in the popup.">
        <IgnoredWordList words={ignoredWords} />
      </SettingsSection>

      <SettingsSection title="LanguageTool on this computer" description="Optional. Without it, grammar is checked with the built-in rules.">
        <LocalLanguageToolSetting isEnabled={settings.isLocalLanguageToolEnabled} />
      </SettingsSection>

      <SettingsSection
        title="AI rewriting"
        description="Optional. Adds Rewrite with AI to the popup and, if you turn it on, to the Ctrl+Shift+Space shortcut on websites, using your own API key."
      >
        {aiSettings && <AiSettingsForm stored={aiSettings} />}
        <AiShortcutSettings settings={settings} onUpdate={updateSettings} />
      </SettingsSection>

      <SettingsSection title="Appearance" description="Colours for the popup, this page and the suggestions on websites.">
        <ThemeField theme={settings.theme} onChange={handleThemeChange} />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <PrivacySummary />
      </SettingsSection>
    </main>
  )
}

export default Options
