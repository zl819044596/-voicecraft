import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { DemoProvider } from '@/lib/demo'
import { I18nProvider } from '@/lib/i18n'
import { Toaster } from '@/components/ui/sonner'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <I18nProvider>
      <DemoProvider>
        <App />
        <Toaster theme="dark" position="top-right" richColors={false} />
      </DemoProvider>
    </I18nProvider>
  </BrowserRouter>,
)
