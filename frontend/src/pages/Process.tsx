import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
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
import { AUDIT_LABELS } from '../auditLabels'
import type {
  DocumentItem,
  DocumentTypeRef,
  Process,
  RouteStageSnapshot,
  Task,
} from '../api/types'
import { Attachments } from '../components/Attachments'
import { CustomFieldValues, useRefsData } from '../components/CustomFields'
import { InfoCell, InfoGrid } from '../components/InfoGrid'
import { ProcessStatusBadge, TaskStatusBadge } from '../components/StatusBadge'
import { useAuth } from '../auth'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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

const KIND_LABEL: Record<string, string> = {
  APPROVAL: 'согласование',
  EXECUTION: 'исполнение',
  ACKNOWLEDGEMENT: 'ознакомление',
}

interface ProcessCommentItem {
  id: string
  user_id: string
  user_name: string | null
  text: string
  created_at: string
}

export function ProcessPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const refs = useRefsData(true)
  const [process, setProcess] = useState<Process | null>(null)
  const [documentItem, setDocumentItem] = useState<DocumentItem | null>(null)
  const [docTypes, setDocTypes] = useState<DocumentTypeRef[]>([])
  const [tab, setTab] = useState(0)
  const [error, setError] = useState('')
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeComment, setCloseComment] = useState('')

  // обсуждение
  const [comments, setComments] = useState<ProcessCommentItem[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)

  const reload = useCallback(() => {
    api<Process>(`/api/processes/${id}`)
      .then((p) => {
        setProcess(p)
        api<DocumentItem>(`/api/documents/${p.object_id}`)
          .then(setDocumentItem)
          .catch(() => setDocumentItem(null))
        api<ProcessCommentItem[]>(`/api/processes/${id}/comments`)
          .then(setComments)
          .catch(() => {})
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Ошибка'))
  }, [id])

  useEffect(reload, [reload])

  const sendComment = async () => {
    if (!commentText.trim()) return
    setCommentBusy(true)
    try {
      const created = await api<ProcessCommentItem>(
        `/api/processes/${id}/comments`,
        { method: 'POST', body: { text: commentText.trim() } },
      )
      setComments((prev) => [...prev, created])
      setCommentText('')
    } finally {
      setCommentBusy(false)
    }
  }

  useEffect(() => {
    api<DocumentTypeRef[]>('/api/refs/document-types').then(setDocTypes)
  }, [])

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
        <Tooltip title="Печатная форма">
          <IconButton onClick={() => window.open(`/print/${process.object_id}`, '_blank')}>
            <PrintOutlinedIcon />
          </IconButton>
        </Tooltip>
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
        <Tab
          label={comments.length ? `Обсуждение (${comments.length})` : 'Обсуждение'}
          sx={{ textTransform: 'none' }}
        />
      </Tabs>

      {tab === 0 && (
        <>
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <InfoGrid>
              <InfoCell label="Организация" value={process.organization_name ?? '—'} />
              <InfoCell label="Проект" value={process.project_name ?? '—'} />
              <InfoCell label="Инициатор" value={process.initiator_name ?? '—'} />
              <InfoCell label="Запущен" value={formatDateTime(process.started_at)} />
              <InfoCell label="Завершён" value={formatDateTime(process.completed_at)} />
            </InfoGrid>
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

          {(() => {
            const typeFields =
              docTypes.find((t) => t.code === process.object_type)?.fields ?? []
            if (!documentItem || typeFields.length === 0) return null
            return (
              <Paper sx={{ p: 2.5, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Реквизиты</Typography>
                <CustomFieldValues
                  fields={typeFields}
                  values={documentItem.custom_fields}
                  refs={refs}
                />
              </Paper>
            )
          })()}

          <Paper sx={{ p: 2.5 }}>
            <Attachments memoId={process.object_id} canEdit={false} />
          </Paper>
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
                          {task.task_kind && task.task_kind !== 'APPROVAL' && (
                            <Typography component="span" variant="body2" color="text.secondary">
                              {' '}· {KIND_LABEL[task.task_kind]}
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

      {tab === 2 && (
        <Paper sx={{ p: 2.5 }}>
          {comments.length === 0 ? (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Комментариев пока нет. Здесь можно задать вопрос инициатору
              или уточнить детали без отклонения документа.
            </Typography>
          ) : (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {comments.map((comment) => (
                <Box
                  key={comment.id}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: comment.user_id === user?.id
                      ? 'primary.light'
                      : (t) => (t.palette.mode === 'dark' ? '#2a251d' : '#f6f0e2'),
                  }}
                >
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between', mb: 0.5 }}
                  >
                    <Typography variant="subtitle2">
                      {comment.user_name ?? 'Пользователь'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(comment.created_at)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {comment.text}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
          <Stack direction="row" spacing={1}>
            <TextField
              placeholder="Написать комментарий…"
              multiline
              maxRows={4}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendComment()
              }}
            />
            <Button
              variant="contained"
              onClick={sendComment}
              disabled={commentBusy || !commentText.trim()}
              sx={{ flexShrink: 0 }}
            >
              Отправить
            </Button>
          </Stack>
        </Paper>
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
