import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import { BrandingProvider } from './branding'
import { PreferencesProvider } from './preferences'
import { Layout } from './components/Layout'
import { AdminPage } from './pages/Admin'
import { AnalyticsPage } from './pages/Analytics'
import { DashboardPage } from './pages/Dashboard'
import { DocumentsPage } from './pages/Documents'
import { LoginPage } from './pages/Login'
import { PrintDocumentPage } from './pages/PrintDocument'
import { ProcessPage } from './pages/Process'
import { SettingsPage } from './pages/Settings'
import { TasksPage } from './pages/Tasks'

export default function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
      <BrandingProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/print/:documentId" element={<PrintDocumentPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/documents/:typeCode" element={<DocumentsPage />} />
            <Route path="/memos" element={<Navigate to="/documents/MEMO" replace />} />
            <Route path="/process/:id" element={<ProcessPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/analytics" element={<AnalyticsPage />} />
            <Route path="/admin/:entity" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </BrandingProvider>
      </PreferencesProvider>
    </AuthProvider>
  )
}
