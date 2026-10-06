import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './app.css'
import './tokens.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </StrictMode>,
)
