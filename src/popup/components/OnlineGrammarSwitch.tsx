import SwitchField from '../../components/SwitchField.tsx'

export interface OnlineGrammarSwitchProps {
  isEnabled: boolean
  isDisabled: boolean
  onChange: (isEnabled: boolean) => void
}

const OnlineGrammarSwitch = ({ isEnabled, isDisabled, onChange }: OnlineGrammarSwitchProps) => (
  <section aria-label="Grammar source" className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-800">
    <SwitchField
      id="online-grammar"
      label="Online grammar check"
      checked={isEnabled}
      disabled={isDisabled}
      onChange={onChange}
      description={
        <>
          Fix Grammar and Fix Everything send your text to{' '}
          <a href="https://languagetool.org" target="_blank" rel="noreferrer" className="text-brand-700 underline dark:text-brand-300">
            LanguageTool
          </a>
          . Checks as you type stay on this computer.
        </>
      }
    />
  </section>
)

export default OnlineGrammarSwitch
