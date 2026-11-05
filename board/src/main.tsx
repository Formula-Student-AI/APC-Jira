// Fonts and global styles first, so each component's own CSS (imported through App) comes after and wins ties.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/global.css'
import './styles/ui.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme } from './lib/theme'

applyTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
