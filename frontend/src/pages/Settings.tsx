import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'

interface SettingRow {
  label: string
  value: React.ReactNode
  hint?: string
}

interface SettingsInfo {
  auth_mode: string
  storage_backend: string
  storage_local_path: string
  s3_endpoint_url: string | null
  s3_bucket: string
  max_upload_mb: number
}

export function SettingsPage() {
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [info, setInfo] = useState<SettingsInfo | null>(null)

  useEffect(() => {
    api<{ status: string }>('/api/health')
      .then((r) => setApiOk(r.status === 'ok'))
      .catch(() => setApiOk(false))
    api<SettingsInfo>('/api/admin/settings-info').then(setInfo).catch(() => {})
  }, [])

  const rows: SettingRow[] = [
    {
      label: 'Бэкенд',
      value:
        apiOk === null ? (
          <Chip label="Проверка…" size="small" variant="outlined" />
        ) : apiOk ? (
          <Chip label="Работает" color="success" size="small" variant="outlined" />
        ) : (
          <Chip label="Недоступен" color="error" size="small" variant="outlined" />
        ),
    },
    {
      label: 'Аутентификация',
      value: <Chip label="Dev-режим (без пароля)" color="warning" size="small" variant="outlined" />,
      hint: 'В продуктиве заменяется на Keycloak (OIDC) с доменными учётками AD',
    },
    {
      label: 'Хранилище файлов',
      value:
        info === null ? (
          <Chip label="…" size="small" variant="outlined" />
        ) : info.storage_backend === 's3' ? (
          <Chip
            label={`S3: ${info.s3_endpoint_url ?? 'AWS'} / ${info.s3_bucket}`}
            color="info"
            size="small"
            variant="outlined"
          />
        ) : (
          <Chip
            label={`Локально (backend/${info.storage_local_path})`}
            size="small"
            variant="outlined"
          />
        ),
      hint: info
        ? `Лимит файла ${info.max_upload_mb} МБ. Переключение на S3/облако — в backend/.env (STORAGE_BACKEND=s3 + параметры S3): поддерживаются AWS, MinIO, Yandex Object Storage и другие S3-совместимые`
        : undefined,
    },
    {
      label: 'Интеграция 1С:ЗУП',
      value: <Chip label="Отключена" size="small" variant="outlined" />,
      hint: 'Справочники ведутся вручную в разделе «Справочники»',
    },
    {
      label: 'Интеграция 1С:Бухгалтерия',
      value: <Chip label="Отключена" size="small" variant="outlined" />,
    },
    {
      label: 'Уведомления (email / Telegram)',
      value: <Chip label="Не настроены" size="small" variant="outlined" />,
    },
  ]

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Настройки BPM
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Система работает в локальном dev-режиме. Параметры интеграций и
        уведомлений появятся здесь по мере подключения (этапы 1–2 и 6–7
        плана внедрения).
      </Alert>
      <Paper sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          {rows.map((row) => (
            <Stack
              key={row.label}
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center' }}
            >
              <Typography sx={{ width: 280, flexShrink: 0 }}>{row.label}</Typography>
              {row.value}
              {row.hint && (
                <Typography variant="body2" color="text.secondary">
                  {row.hint}
                </Typography>
              )}
            </Stack>
          ))}
        </Stack>
      </Paper>
    </>
  )
}
