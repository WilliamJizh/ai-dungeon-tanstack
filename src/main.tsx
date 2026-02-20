import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { LocaleProvider } from './context/LocaleContext'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <RouterProvider router={router} />
    </LocaleProvider>
  </React.StrictMode>,
)
