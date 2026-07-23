import { useEffect, useState } from 'react'
import TelegramIcon from '@mui/icons-material/Telegram'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'

interface TelegramStatus {
  enabled: boolean
  linked: boolean
  bot_username: string | null
}

/** Привязка Telegram-аккаунта: код + диплинк на бота, автопроверка. */
export function TelegramLinkDialog() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [botLink, setBotLink] = useState<string | null>(null)

  const loadStatus = () =>
    api<TelegramStatus>('/api/my/telegram-status').then(setStatus)

  useEffect(() => {
    if (open) loadStatus()
  }, [open])

  // после выдачи кода опрашиваем статус, пока пользователь жмёт /start в боте
  useEffect(() => {
    if (!open || !code || status?.linked) return
    const timer = window.setInterval(loadStatus, 3000)
    return () => window.clearInterval(timer)
  }, [open, code, status?.linked])

  const requestCode = async () => {
    const result = await api<{ code: string; bot_link: string | null }>(
      '/api/my/telegram-link',
      { method: 'POST' },
    )
    setCode(result.code)
    setBotLink(result.bot_link)
  }

  const unlink = async () => {
    await api('/api/my/telegram-unlink', { method: 'POST' })
    setCode(null)
    loadStatus()
  }

  return (
    <>
      <Tooltip title="Уведомления в Telegram">
        <IconButton size="small" onClick={() => setOpen(true)}>
          <TelegramIcon
            fontSize="small"
            sx={{ color: status?.linked ? '#2AABEE' : 'text.secondary' }}
          />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Telegram-уведомления</DialogTitle>
        <DialogContent>
          {status === null ? null : !status.enabled ? (
            <Alert severity="info">Telegram-бот не настроен администратором.</Alert>
          ) : status.linked ? (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>
                Аккаунт привязан. Уведомления о задачах приходят в Telegram
                с кнопками «Согласовать / Отклонить».
              </Alert>
              <Button variant="outlined" onClick={unlink}>Отвязать</Button>
            </>
          ) : code ? (
            <Stack spacing={1.5}>
              <Typography>
                1. Откройте бота{' '}
                {botLink ? (
                  <Link href={botLink} target="_blank" rel="noreferrer">
                    @{status.bot_username}
                  </Link>
                ) : (
                  <b>@{status.bot_username}</b>
                )}{' '}
                (ссылка сразу подставит код).
              </Typography>
              <Typography>
                2. Либо отправьте боту команду вручную:
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'monospace', p: 1, bgcolor: '#f4f6f9',
                  borderRadius: 1, textAlign: 'center',
                }}
              >
                /start {code}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Ожидаю подтверждения от бота…
              </Typography>
            </Stack>
          ) : (
            <>
              <Typography sx={{ mb: 2 }}>
                Привяжите Telegram, чтобы получать уведомления о задачах
                и согласовывать документы прямо с телефона — даже вне
                корпоративной сети.
              </Typography>
              <Button variant="contained" onClick={requestCode}>
                Получить код привязки
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
