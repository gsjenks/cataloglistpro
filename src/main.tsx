// src/main.tsx
// UPDATED: Added ErrorBoundary to catch and handle app crashes

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { Capacitor } from '@capacitor/core'
import { defineCustomElements } from '@ionic/pwa-elements/loader'

// Initialize PWA Elements ONLY on web platform (not on native iOS/Android)
// This allows native camera to work on mobile devices
if (Capacitor.getPlatform() === 'web') {
  defineCustomElements(window)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)