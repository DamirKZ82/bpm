import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
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
import { useTranslation } from 'react-i18next'
import { ApiError, api } from '../api/client'
import type { MyTask, TaskKind } from '../api/types'

const kindOf = (task: MyTask): TaskKind => task.task_kind ?? 'APPROVAL'

type ActionMode = 'approve' | 'reject' | 'return'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function TasksPage() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<MyTask[] | null>(null)
  const [action, setAction] = useState<{ task: MyTask; mode: ActionMode } | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    api<MyTask[]>('/api/tasks/my').then(setTasks)
  }, [])

  useEffect(reload, [reload])

  const submit = async () => {
    if (!action) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/tasks/${action.task.id}/${action.mode}`, {
        method: 'POST',
        body: { comment: comment.trim() || null },
      })
      setAction(null)
      setComment('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  if (tasks === null) return null

  // подпись действия: согласовать/исполнено, отклонить/не выполнено, на доработку
  const actionLabel = (mode: ActionMode, task: MyTask) =>
    mode === 'return' ? t('tasks.returnBtn') : t(`tasks.${mode === 'approve' ? 'do' : 'deny'}${kindOf(task)}`)
  const needsComment = action !== null && action.mode !== 'approve'

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        {t('tasks.title')}
      </Typography>
      <Paper>
        {tasks.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            {t('tasks.noActive')}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('tasks.document')}</TableCell>
                <TableCell>{t('tasks.kind')}</TableCell>
                <TableCell>{t('tasks.initiator')}</TableCell>
                <TableCell>{t('tasks.received')}</TableCell>
                <TableCell>{t('tasks.due')}</TableCell>
                <TableCell align="right" width={230} />
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/process/${task.process_id}`}>
                      {task.subject ?? task.object_type}
                    </Link>
                    {task.substitute_for_id && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {t('tasks.asSubstitute')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{t(`tasks.kind${kindOf(task)}`)}</TableCell>
                  <TableCell>{task.initiator_name ?? '—'}</TableCell>
                  <TableCell>{formatDate(task.process_started_at)}</TableCell>
                  <TableCell
                    sx={
                      task.due_at !== null &&
                      new Date(task.due_at + 'Z').getTime() < Date.now()
                        ? { color: 'error.main', fontWeight: 600 }
                        : undefined
                    }
                  >
                    {formatDate(task.due_at)}
                    {task.due_at !== null &&
                      new Date(task.due_at + 'Z').getTime() < Date.now() &&
                      ` · ${t('tasks.overdue')}`}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => { setAction({ task, mode: 'approve' }); setComment(''); setError('') }}
                      >
                        {t(`tasks.do${kindOf(task)}`)}
                      </Button>
                      {/* ознакомление нельзя отклонить/вернуть — только подтвердить */}
                      {kindOf(task) !== 'ACKNOWLEDGEMENT' && (
                        <>
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={() => { setAction({ task, mode: 'return' }); setComment(''); setError('') }}
                          >
                            {t('tasks.returnBtn')}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => { setAction({ task, mode: 'reject' }); setComment(''); setError('') }}
                          >
                            {t(`tasks.deny${kindOf(task)}`)}
                          </Button>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={action !== null} onClose={() => setAction(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {action ? actionLabel(action.mode, action.task) : ''}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {action?.task.subject}
          </Typography>
          <TextField
            label={
              action?.mode === 'return'
                ? t('tasks.returnHint')
                : needsComment
                  ? t('tasks.commentRequired')
                  : t('tasks.commentOptional')
            }
            multiline
            minRows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            autoFocus
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAction(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color={
              action?.mode === 'approve'
                ? 'primary'
                : action?.mode === 'return'
                  ? 'warning'
                  : 'error'
            }
            onClick={submit}
            disabled={busy || (needsComment && !comment.trim())}
          >
            {action ? actionLabel(action.mode, action.task) : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
