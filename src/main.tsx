import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './index.css'
import App from './App.tsx'
import { WidgetBubble } from './components/WidgetBubble.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { initFileLogging } from './lib/logger.ts'

const isWidgetWindow = getCurrentWindow().label === 'widget'

if (isWidgetWindow) {
  document.documentElement.classList.add('widget-window')
} else {
  initFileLogging()
}

if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase()
    const blocked =
      key === 'f12' ||
      (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(key)) ||
      (e.ctrlKey && key === 'u') ||
      (e.metaKey && key === 'u')
    if (blocked) e.preventDefault()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isWidgetWindow ? <WidgetBubble /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)

// Double rAF waits for the app's first real paint (not just React's commit)
// before dropping the pre-mount splash, so there's no flash of blank content.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('splash')
    if (splash) {
      splash.style.opacity = '0'
      setTimeout(() => splash.remove(), 150)
    }
  })
})
