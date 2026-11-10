import { DEFAULT_SETTINGS, THEMES, type Theme } from '../constants/settings.ts'
import { getSettings, onSettingsChanged } from './settings.ts'

export type ColorScheme = Exclude<Theme, typeof THEMES.system>

export const resolveTheme = (theme: Theme, isSystemDark: boolean): ColorScheme => {
  if (theme !== THEMES.system) return theme
  return isSystemDark ? THEMES.dark : THEMES.light
}

// The stylesheets only know light and dark. System is resolved here, and again whenever the OS theme changes, so an
// open page follows the OS switching over at sunset. Returns the setter for the Theme setting.
export const watchTheme = (onColorScheme: (colorScheme: ColorScheme) => void): ((theme: Theme) => void) => {
  const systemDarkQuery = matchMedia('(prefers-color-scheme: dark)')
  let currentTheme = DEFAULT_SETTINGS.theme
  const notify = () => onColorScheme(resolveTheme(currentTheme, systemDarkQuery.matches))

  systemDarkQuery.addEventListener('change', notify)
  notify()

  return (theme) => {
    currentTheme = theme
    notify()
  }
}

// For the popup and the settings page. System applies straight away, so the page is not drawn light first while the
// stored setting loads; a failed load keeps it.
export const followThemeSetting = (element: HTMLElement): void => {
  const setTheme = watchTheme((colorScheme) => {
    element.dataset.theme = colorScheme
  })

  getSettings()
    .then(({ theme }) => setTheme(theme))
    .catch(() => {})
  onSettingsChanged(({ theme }) => setTheme(theme))
}
