import SwitchField from '../../components/SwitchField.jsx'

const OnlineGrammarSwitch = ({ isEnabled, isDisabled, onChange }) => (
  <section aria-label="Grammar source" className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
    <SwitchField
      id="online-grammar"
      label="Online grammar check"
      checked={isEnabled}
      disabled={isDisabled}
      onChange={onChange}
      description={
        <>
          Fix Grammar and Fix Everything send your text to{' '}
          <a href="https://languagetool.org" target="_blank" rel="noreferrer" className="text-brand-700 underline">
            LanguageTool
          </a>
          . Checks as you type stay on this computer.
        </>
      }
    />
  </section>
)

export default OnlineGrammarSwitch
