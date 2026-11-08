import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tailwind.css'
import Popup from './Popup.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
