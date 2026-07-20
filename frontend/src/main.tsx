import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { installGlobalMonitoringHandlers } from './utils/monitoring'
import './index.css'

installGlobalMonitoringHandlers()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AppErrorBoundary>
)
