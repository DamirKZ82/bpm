import { useCallback, useEffect, useState } from 'react'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ApiError, api, downloadFile } from '../api/client'
import type { Attachment } from '../api/types'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/** Вложения документа: список + скачивание; загрузка/удаление при canEdit. */
export function Attachments({
  memoId,
  canEdit,
}: {
  memoId: string
  canEdit: boolean
}) {
  const [items, setItems] = useState<Attachment[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    api<Attachment[]>(`/api/memos/${memoId}/attachments`)
      .then(setItems)
      .catch(() => setItems([]))
  }, [memoId])

  useEffect(reload, [reload])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        await api(`/api/memos/${memoId}/attachments`, { method: 'POST', body: form })
      }
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (attachment: Attachment) => {
    setError('')
    try {
      await api(`/api/attachments/${attachment.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка удаления')
    }
  }

  return (
    <div>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">Вложения</Typography>
        {canEdit && (
          <Button
            component="label"
            size="small"
            startIcon={<UploadFileIcon />}
            disabled={busy}
          >
            Загрузить
            <input
              type="file"
              hidden
              multiple
              onChange={(e) => {
                void upload(e.target.files)
                e.target.value = ''
              }}
            />
          </Button>
        )}
      </Stack>
      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
      {items !== null && items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Файлов нет
        </Typography>
      ) : (
        <List dense disablePadding>
          {(items ?? []).map((attachment) => (
            <ListItem
              key={attachment.id}
              disableGutters
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Скачать">
                    <IconButton
                      size="small"
                      onClick={() =>
                        downloadFile(
                          `/api/attachments/${attachment.id}/download`,
                          attachment.filename,
                        )
                      }
                    >
                      <DownloadOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {canEdit && (
                    <Tooltip title="Удалить">
                      <IconButton size="small" onClick={() => remove(attachment)}>
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              }
            >
              <ListItemIcon sx={{ minWidth: 30 }}>
                <AttachFileIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={attachment.filename}
                secondary={formatSize(attachment.size_bytes)}
              />
            </ListItem>
          ))}
        </List>
      )}
    </div>
  )
}
