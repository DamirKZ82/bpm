import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api/client'
import type { Process, RouteStageSnapshot, Task } from '../api/types'
import { Attachments } from '../components/Attachments'
import { ProcessStatusBadge, TaskStatusBadge } from '../components/StatusBadge'
import { useAuth } from '../auth'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const AUDIT_LABELS: Record<string, string> = {
  PROCESS_STARTED: 'Процесс запущен',
  TASK_APPROVED: 'Согласовано',
  TASK_REJECTED: 'Отклонено',
  TASK_AUTO_APPROVED: 'Автосогласовано',
  PROCESS_APPROVED: 'Процесс согласован',
  PROCESS_REJECTED: 'Процесс отклонён',
  PROCESS_CANCELLED: 'Процесс отозван инициатором',
  PROCESS_FORCE_CLOSED: 'Процесс закрыт администратором',
}

const STAGE_COLORS: Record<string, string> = {
  done: 'success.main',
  current: 'primary.main',
  blocked: 'error.main',
  pending: 'divider',
  skipped: 'divider',
}

function stageState(stage: RouteStageSnapshot, tasks: Task[], processStatus: string) {
  const stageTasks = tasks.filter((t) => t.stage_no === stage.stage_no)
  if (stageTasks.length === 0) return 'skipped'
  if (stageTasks.some((t) => t.result === 'REJECTED')) return 'blocked'
  const open = stageTasks.some((t) => t.status === 'ACTIVE' || t.status === 'PENDING')
  if (!open) return 'done'
  if (stageTasks.some((t) => t.status === 'ACTIVE')) return 'current'
  return processStatus === 'IN_PROGRESS' ? 'pending' : 'skipped'
}

const STAGE_TYPE_LABEL: Record<string, string> = {
  PARALLEL_ALL: ' · параллельно, все',
  PARALLEL_ANY: ' · параллельно, любой',
}

export function ProcessPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [process, setProcess] = useState<Process | null>(null)
  const [tab, setTab] = useState(0)
  const [error, setError] = useState('')
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeComment, setCloseComment] = useState('')

  const reload = useCallback(() => {
    api<Process>(`/api/processes/${id}`)
      .then(setProcess)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Ошибка'))
  }, [id])

  useEffect(reload, [reload])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!process) return null

  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const isInitiator = user?.id === process.initiator_id
  const active = process.status === 'IN_PROGRESS'

  const cancel = async () => {
    if (!confirm('Отозвать документ с согласования?')) return
    try {
      await api(`/api/processes/${process.id}/cancel`, { method: 'POST' })
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  const forceClose = async () => {
    try {
      await api(`/api/processes/${process.id}/force-close`, {
        method: 'POST',
        body: { comment: closeComment },
      })
      setCloseOpen(false)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  const tasksBySlot = (stageNo: number, orderInStage: number) =>
    process.tasks.filter(
      (t) => t.stage_no === stageNo && t.order_in_stage === orderInStage,
    )

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 0.5, alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {process.subject ?? 'Документ'}
        </Typography>
        <ProcessStatusBadge status={process.status} />
      </Stack>
      {process.doc_number && (
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          {process.doc_number}
          {process.doc_date &&
            ` от ${new Date(process.doc_date).toLocaleDateString('ru-RU')}`}
        </Typography>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Документ" sx={{ textTransform: 'none' }} />
        <Tab label="Согласование" sx={{ textTransform: 'none' }} />
      </Tabs>

      {tab === 0 && (
        <>
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Table size="small" sx={{ '& td': { border: 0, py: 0.5 } }}>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary', width: 160 }}>Организация</TableCell>
                  <TableCell>{process.organization_name ?? '—'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary' }}>Проект</TableCell>
                  <TableCell>{process.project_name ?? '—'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary' }}>Инициатор</TableCell>
                  <TableCell>{process.initiator_name ?? '—'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary' }}>Запущен</TableCell>
                  <TableCell>{formatDateTime(process.started_at)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary' }}>Завершён</TableCell>
                  <TableCell>{formatDateTime(process.completed_at)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {(isInitiator || isAdmin) && active && (
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                {isInitiator && (
                  <Button variant="outlined" onClick={cancel}>Отозвать</Button>
                )}
                {isAdmin && (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => { setCloseOpen(true); setCloseComment('') }}
                  >
                    Принудительно завершить
                  </Button>
                )}
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Содержание</Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>
              {process.doc_body ?? '—'}
            </Typography>
          </Paper>

          {process.object_type === 'MEMO' && (
            <Paper sx={{ p: 2.5 }}>
              <Attachments memoId={process.object_id} canEdit={false} />
            </Paper>
          )}
        </>
      )}

      {tab === 1 && (
        <>
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Маршрут</Typography>
            {process.route_snapshot?.stages.map((stage) => {
              const state = stageState(stage, process.tasks, process.status)
              return (
                <Box
                  key={stage.stage_no}
                  sx={{
                    borderLeft: 3,
                    borderColor: STAGE_COLORS[state],
                    pl: 2, py: 0.5, mb: 1.5,
                  }}
                >
                  <Typography sx={{ mb: 0.5, fontWeight: 600 }}>
                    Этап {stage.stage_no}
                    {STAGE_TYPE_LABEL[stage.stage_type]}
                    {stage.stage_type === 'QUORUM' && ` · кворум ${stage.quorum_count}`}
                  </Typography>
                  {stage.slots.map((slot) => {
                    if (slot.skipped) {
                      return (
                        <Typography
                          key={slot.order_in_stage}
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 0.5 }}
                        >
                          {slot.position_name ?? slot.resolver_type} — пропущен (нет исполнителя)
                        </Typography>
                      )
                    }
                    return tasksBySlot(stage.stage_no, slot.order_in_stage).map((task) => (
                      <Stack
                        key={task.id}
                        direction="row"
                        spacing={1}
                        sx={{ py: 0.5, flexWrap: 'wrap', alignItems: 'center' }}
                      >
                        <TaskStatusBadge status={task.status} result={task.result} />
                        <Typography variant="body2">
                          {task.assignee_name}
                          {slot.position_name && (
                            <Typography component="span" variant="body2" color="text.secondary">
                              {' '}· {slot.position_name}
                            </Typography>
                          )}
                          {task.substitute_for_id && (
                            <Typography component="span" variant="body2" color="text.secondary">
                              {' '}(замещение)
                            </Typography>
                          )}
                        </Typography>
                        {task.comment && (
                          <Typography variant="body2" color="text.secondary">
                            — {task.comment}
                          </Typography>
                        )}
                      </Stack>
                    ))
                  })}
                </Box>
              )
            })}
          </Paper>

          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>История</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Когда</TableCell>
                  <TableCell>Кто</TableCell>
                  <TableCell>Действие</TableCell>
                  <TableCell>Комментарий</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {process.audit.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>{formatDateTime(entry.created_at)}</TableCell>
                    <TableCell>{entry.user_name ?? 'Система'}</TableCell>
                    <TableCell>{AUDIT_LABELS[entry.action] ?? entry.action}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {typeof entry.payload?.comment === 'string' ? entry.payload.comment : ''}
                      {typeof entry.payload?.reason === 'string' ? entry.payload.reason : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Принудительное завершение</DialogTitle>
        <DialogContent>
          <TextField
            label="Комментарий (обязательно)"
            multiline
            minRows={3}
            value={closeComment}
            onChange={(e) => setCloseComment(e.target.value)}
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            color="error"
            onClick={forceClose}
            disabled={!closeComment.trim()}
          >
            Завершить процесс
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
