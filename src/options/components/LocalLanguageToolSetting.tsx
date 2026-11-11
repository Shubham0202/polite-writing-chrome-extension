import SwitchField from '../../components/SwitchField.tsx'
import { LOCAL_LANGUAGE_TOOL } from '../../constants/settings.ts'
import { useLocalLanguageTool } from '../hooks/useLocalLanguageTool.ts'

interface LocalLanguageToolSettingProps {
  isEnabled: boolean
}

const LocalLanguageToolSetting = ({ isEnabled }: LocalLanguageToolSettingProps) => {
  const { error, setIsEnabled } = useLocalLanguageTool()

  return (
    <>
      <SwitchField
        id="setting-isLocalLanguageToolEnabled"
        label="Use a LanguageTool server on this computer"
        description={`Adds LanguageTool's grammar and punctuation checks from a server at ${LOCAL_LANGUAGE_TOOL.serverUrl}, for checks as you type and for the popup while Online grammar check is off. Chrome asks for access to that address when you turn this on. Turn it on only if you run the server yourself: whatever program uses that address receives the text.`}
        checked={isEnabled}
        onChange={setIsEnabled}
      />
      {error && (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </>
  )
}

export default LocalLanguageToolSetting
