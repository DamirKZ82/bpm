import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import { ApiError, api } from '../api/client'
import type { Memo } from '../api/types'
import { Attachments } from '../components/Attachments'
import { ProcessStatusBadge } from '../components/StatusBadge'
import { useAuth } from '../auth'

function formatDate(value: string): string {
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function MemosPage() {
  const { user } = useAuth()
  const [memos, setMemos] = useState<Memo[] | null>(null)
  const [editing, setEditing] = useState<Partial<Memo> | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    api<Memo[]>('/api/memos').then(setMemos)
  }, [])

  useEffect(reload, [reload])

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const body = { subject: editing.subject ?? '', body: editing.body ?? '' }
      if (editing.id) {
        await api(`/api/memos/${editing.id}`, { method: 'PATCH', body })
        setEditing(null)
      } else {
        // после создания диалог остаётся открытым — можно добавить вложения
        const saved = await api<Memo>('/api/memos', { method: 'POST', body })
        setEditing(saved)
      }
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const submitForApproval = async (memo: Memo) => {
    setListError('')
    try {
      await api(`/api/memos/${memo.id}/submit`, { method: 'POST', body: {} })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  const remove = async (memo: Memo) => {
    if (!confirm(`Удалить черновик «${memo.subject}»?`)) return
    setListError('')
    try {
      await api(`/api/memos/${memo.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  if (memos === null) return null

  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const canCreate = user?.employee_id != null
  const isMine = (memo: Memo) => memo.author_id === user?.id
  const isEditable = (memo: Memo) =>
    !memo.process ||
    ['REJECTED', 'CANCELLED', 'FORCE_CLOSED'].includes(memo.process.status)

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {isAdmin ? 'Служебные записки (все)' : 'Мои служебные записки'}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled={!canCreate}
          onClick={() => { setEditing({}); setError('') }}
        >
          Новая записка
        </Button>
      </Stack>
      {!canCreate && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Учётная запись не сопоставлена с сотрудником — создание заявок
          недоступно. Обратитесь к администратору.
        </Alert>
      )}
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

      <Paper>
        {memos.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            Записок пока нет
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Тема</TableCell>
                {isAdmin && <TableCell>Автор</TableCell>}
                <TableCell>Создана</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right" width={310} />
              </TableRow>
            </TableHead>
            <TableBody>
              {memos.map((memo) => (
                <TableRow key={memo.id} hover>
                  <TableCell>
                    {memo.process ? (
                      <Link component={RouterLink} to={`/process/${memo.process.id}`}>
                        {memo.subject}
                      </Link>
                    ) : isMine(memo) ? (
                      memo.subject
                    ) : (
                      <Link
                        component="button"
                        onClick={() => { setEditing(memo); setError('') }}
                      >
                        {memo.subject}
                      </Link>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>{memo.author_name ?? '—'}</TableCell>
                  )}
                  <TableCell>{formatDate(memo.created_at)}</TableCell>
                  <TableCell>
                    {memo.process ? (
                      <ProcessStatusBadge status={memo.process.status} />
                    ) : (
                      <Chip label="Черновик" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      {isMine(memo) && isEditable(memo) && (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => submitForApproval(memo)}
                          >
                            {memo.process ? 'Отправить повторно' : 'На согласование'}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => { setEditing(memo); setError('') }}
                          >
                            Изменить
                          </Button>
                        </>
                      )}
                      {isMine(memo) && !memo.process && (
                        <Button size="small" variant="outlined" onClick={() => remove(memo)}>
                          Удалить
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {!editing?.id
            ? 'Новая служебная записка'
            : editing.author_id === user?.id || !editing.author_id
              ? 'Служебная записка'
              : `Служебная записка — ${editing.author_name ?? 'другой автор'}`}
        </DialogTitle>
        <DialogContent>
          {(() => {
            const readOnly = Boolean(editing?.id) && editing?.author_id !== user?.id
            return (
              <>
                <TextField
                  label="Тема"
                  value={editing?.subject ?? ''}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                  autoFocus={!readOnly}
                  disabled={readOnly}
                  sx={{ mt: 1, mb: 2 }}
                />
                <TextField
                  label="Содержание"
                  multiline
                  minRows={5}
                  value={editing?.body ?? ''}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  disabled={readOnly}
                />
                {editing?.id ? (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Attachments memoId={editing.id} canEdit={!readOnly} />
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Вложения можно добавить после сохранения
                  </Typography>
                )}
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
              </>
            )
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Закрыть</Button>
          {(!editing?.id || editing?.author_id === user?.id) && (
            <Button
              variant="contained"
              onClick={save}
              disabled={busy || !(editing?.subject ?? '').trim() || !(editing?.body ?? '').trim()}
            >
              Сохранить
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  )
}
