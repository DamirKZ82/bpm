import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api/client'
import { useBranding } from '../branding'

interface StorageSettings {
  storage_backend: 'local' | 's3'
  storage_local_path: string
  max_upload_mb: number
  s3_endpoint_url: string
  s3_bucket: string
  s3_access_key: string
  s3_region: string
  s3_secret_set: boolean
}

interface SettingsInfo {
  auth_mode: string
  email_enabled: boolean
  telegram_enabled: boolean
  email_approval_enabled: boolean
}

export function SettingsPage() {
  const { appName, logoUrl, refresh: refreshBranding } = useBranding()
  const [nameInput, setNameInput] = useState('')
  const [brandBusy, setBrandBusy] = useState(false)
  const [brandMsg, setBrandMsg] = useState('')
  const [brandErr, setBrandErr] = useState('')
  useEffect(() => { setNameInput(appName) }, [appName])

  const saveAppName = async () => {
    setBrandBusy(true); setBrandMsg(''); setBrandErr('')
    try {
      await api('/api/branding', { method: 'PUT', body: { app_name: nameInput.trim() } })
      refreshBranding()
      setBrandMsg('Название сохранено')
    } catch (err) {
      setBrandErr(err instanceof ApiError ? err.message : 'Ошибка')
    } finally { setBrandBusy(false) }
  }

  const uploadLogo = async (file: File) => {
    setBrandBusy(true); setBrandMsg(''); setBrandErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api('/api/branding/logo', { method: 'POST', body: fd })
      refreshBranding()
      setBrandMsg('Логотип загружен')
    } catch (err) {
      setBrandErr(err instanceof ApiError ? err.message : 'Ошибка загрузки')
    } finally { setBrandBusy(false) }
  }

  const removeLogo = async () => {
    setBrandBusy(true); setBrandMsg(''); setBrandErr('')
    try {
      await api('/api/branding/logo', { method: 'DELETE' })
      refreshBranding()
      setBrandMsg('Логотип удалён — используется встроенный')
    } catch (err) {
      setBrandErr(err instanceof ApiError ? err.message : 'Ошибка')
    } finally { setBrandBusy(false) }
  }

  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [storage, setStorage] = useState<StorageSettings | null>(null)
  const [secret, setSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ status: string }>('/api/health')
      .then((r) => setApiOk(r.status === 'ok'))
      .catch(() => setApiOk(false))
    api<SettingsInfo>('/api/admin/settings-info')
      .then(setInfo)
      .catch(() => {})
    api<StorageSettings>('/api/admin/settings/storage')
      .then(setStorage)
      .catch(() => {})
  }, [])

  const authMode = info?.auth_mode ?? null

  const saveStorage = async () => {
    if (!storage) return
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const { s3_secret_set: _ignored, ...rest } = storage
      const updated = await api<StorageSettings>('/api/admin/settings/storage', {
        method: 'PUT',
        body: { ...rest, s3_secret_key: secret || null },
      })
      setStorage(updated)
      setSecret('')
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const update = (patch: Partial<StorageSettings>) =>
    setStorage((prev) => (prev ? { ...prev, ...patch } : prev))

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Настройки BPM
      </Typography>

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Состояние</Typography>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography sx={{ width: 260, flexShrink: 0 }}>Бэкенд</Typography>
            {apiOk === null ? (
              <Chip label="Проверка…" size="small" variant="outlined" />
            ) : apiOk ? (
              <Chip label="Работает" color="success" size="small" variant="outlined" />
            ) : (
              <Chip label="Недоступен" color="error" size="small" variant="outlined" />
            )}
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography sx={{ width: 260, flexShrink: 0 }}>Аутентификация</Typography>
            <Chip
              label={authMode === 'dev' ? 'Dev-режим (без пароля)' : authMode ?? '…'}
              color={authMode === 'dev' ? 'warning' : 'default'}
              size="small"
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary">
              В продуктиве заменяется на Keycloak (OIDC) с учётками AD
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography sx={{ width: 260, flexShrink: 0 }}>Интеграции 1С (ЗУП / Бухгалтерия)</Typography>
            <Chip label="Отключены" size="small" variant="outlined" />
            <Typography variant="body2" color="text.secondary">
              Справочники ведутся вручную
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography sx={{ width: 260, flexShrink: 0 }}>Уведомления</Typography>
            <Chip
              label={info?.email_enabled ? 'Email включён' : 'Email выключен'}
              color={info?.email_enabled ? 'success' : 'default'}
              size="small"
              variant="outlined"
            />
            <Chip
              label={info?.telegram_enabled ? 'Telegram включён' : 'Telegram выключен'}
              color={info?.telegram_enabled ? 'success' : 'default'}
              size="small"
              variant="outlined"
            />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography sx={{ width: 260, flexShrink: 0 }}>Согласование по почте</Typography>
            <Chip
              label={info?.email_approval_enabled ? 'Включено (IMAP)' : 'Выключено'}
              color={info?.email_approval_enabled ? 'success' : 'default'}
              size="small"
              variant="outlined"
            />
            {!info?.email_approval_enabled && (
              <Typography variant="body2" color="text.secondary">
                Включается IMAP_HOST в .env (для mail.ru: imap.mail.ru)
              </Typography>
            )}
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Брендирование</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Название и логотип приложения. Логотип отображается в меню, на
          странице входа и в печатных формах. Рекомендуется PNG/SVG с
          прозрачным фоном, высотой от 64 px, до 2 МБ.
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 560 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
            <TextField
              label="Название приложения"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="contained"
              onClick={saveAppName}
              disabled={brandBusy || !nameInput.trim() || nameInput.trim() === appName}
              sx={{ mt: 0.5 }}
            >
              Сохранить
            </Button>
          </Stack>

          <Typography variant="body2" sx={{ fontWeight: 600 }}>Логотип</Typography>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Paper
              variant="outlined"
              sx={{
                width: 200, height: 72, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                bgcolor: (t) => (t.palette.mode === 'dark' ? '#211d17' : '#faf6ec'),
                overflow: 'hidden',
              }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Логотип" style={{ maxHeight: 56, maxWidth: 184 }} />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Встроенный логотип
                </Typography>
              )}
            </Paper>
            <Stack spacing={1}>
              <Button variant="outlined" component="label" disabled={brandBusy}>
                Загрузить логотип
                <input
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif,image/x-icon"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadLogo(f)
                    e.target.value = ''
                  }}
                />
              </Button>
              {logoUrl && (
                <Button color="error" onClick={removeLogo} disabled={brandBusy}>
                  Удалить логотип
                </Button>
              )}
            </Stack>
          </Stack>
          {brandErr && <Alert severity="error">{brandErr}</Alert>}
          {brandMsg && <Alert severity="success">{brandMsg}</Alert>}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Хранилище файлов</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Где хранятся вложения документов. S3-совместимые сервисы: AWS,
          MinIO, Yandex Object Storage, VK Cloud и другие (для не-AWS
          укажите адрес endpoint).
        </Typography>
        {storage === null ? (
          <Typography color="text.secondary">Загрузка…</Typography>
        ) : (
          <Stack spacing={2} sx={{ maxWidth: 560 }}>
            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="Способ хранения"
                value={storage.storage_backend}
                onChange={(e) =>
                  update({ storage_backend: e.target.value as 'local' | 's3' })
                }
              >
                <MenuItem value="local">Локально (диск сервера)</MenuItem>
                <MenuItem value="s3">S3 / облачный сервис</MenuItem>
              </TextField>
              <TextField
                label="Лимит файла, МБ"
                type="number"
                value={storage.max_upload_mb}
                onChange={(e) => update({ max_upload_mb: Number(e.target.value) })}
              />
            </Stack>
            {storage.storage_backend === 'local' ? (
              <TextField
                label="Папка хранения"
                helperText="Относительный путь — от папки backend/"
                value={storage.storage_local_path}
                onChange={(e) => update({ storage_local_path: e.target.value })}
              />
            ) : (
              <>
                <TextField
                  label="Endpoint URL"
                  placeholder="https://storage.yandexcloud.net (пусто = AWS)"
                  value={storage.s3_endpoint_url}
                  onChange={(e) => update({ s3_endpoint_url: e.target.value })}
                />
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Bucket"
                    value={storage.s3_bucket}
                    onChange={(e) => update({ s3_bucket: e.target.value })}
                  />
                  <TextField
                    label="Регион"
                    value={storage.s3_region}
                    onChange={(e) => update({ s3_region: e.target.value })}
                  />
                </Stack>
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Access key"
                    value={storage.s3_access_key}
                    onChange={(e) => update({ s3_access_key: e.target.value })}
                  />
                  <TextField
                    label="Secret key"
                    type="password"
                    placeholder={storage.s3_secret_set ? '••••••• (сохранён)' : ''}
                    helperText="Пусто = оставить прежний"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </Stack>
              </>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {saved && <Alert severity="success">Настройки сохранены</Alert>}
            <Stack direction="row">
              <Button variant="contained" onClick={saveStorage} disabled={busy}>
                Сохранить
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </>
  )
}
