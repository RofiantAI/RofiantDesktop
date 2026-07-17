import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

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
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
