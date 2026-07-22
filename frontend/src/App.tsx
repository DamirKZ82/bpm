import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import { Layout } from './components/Layout'
import { AdminPage } from './pages/Admin'
import { LoginPage } from './pages/Login'
import { MemosPage } from './pages/Memos'
import { ProcessPage } from './pages/Process'
import { SettingsPage } from './pages/Settings'
import { TasksPage } from './pages/Tasks'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/memos" element={<MemosPage />} />
            <Route path="/process/:id" element={<ProcessPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/:entity" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
