import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import Badge from '@mui/material/Badge'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'

export interface NotificationItem {
  id: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

function formatTime(value: string): string {
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function NotificationsBell({
  unread,
  onChanged,
}: {
  unread: number
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [items, setItems] = useState<NotificationItem[]>([])

  const open = async (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget)
    setItems(await api<NotificationItem[]>('/api/notifications'))
  }

  const click = async (item: NotificationItem) => {
    setAnchor(null)
    if (!item.read) {
      await api(`/api/notifications/${item.id}/read`, { method: 'POST' })
      onChanged()
    }
    if (item.link) navigate(item.link)
  }

  const readAll = async () => {
    await api('/api/notifications/read-all', { method: 'POST' })
    setItems((prev) => prev.map((i) => ({ ...i, read: true })))
    onChanged()
  }

  return (
    <>
      <Tooltip title="Уведомления">
        <IconButton size="small" onClick={open} sx={{ color: 'text.secondary' }}>
          <Badge badgeContent={unread} color="primary" max={99}>
            <NotificationsNoneIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 480 } } }}
      >
        <Stack
          direction="row"
          sx={{ px: 2, py: 0.5, alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Typography variant="subtitle2">Уведомления</Typography>
          {items.some((i) => !i.read) && (
            <Button size="small" onClick={readAll}>Прочитать все</Button>
          )}
        </Stack>
        {items.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
            Уведомлений нет
          </Typography>
        ) : (
          items.map((item) => (
            <MenuItem
              key={item.id}
              onClick={() => click(item)}
              sx={{
                whiteSpace: 'normal',
                alignItems: 'flex-start',
                bgcolor: item.read ? undefined : 'primary.light',
                display: 'block',
                py: 1,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: item.read ? 400 : 600 }}>
                {item.title}
              </Typography>
              {item.body && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {item.body}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {formatTime(item.created_at)}
              </Typography>
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  )
}
