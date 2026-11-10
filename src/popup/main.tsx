import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { followThemeSetting } from '../services/theme.ts'
import '../styles/tailwind.css'
import Popup from './Popup.tsx'

followThemeSetting(document.documentElement)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
