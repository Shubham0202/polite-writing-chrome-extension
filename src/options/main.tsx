import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { followThemeSetting } from '../services/theme.ts'
import '../styles/tailwind.css'
import Options from './Options.tsx'

followThemeSetting(document.documentElement)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
)
