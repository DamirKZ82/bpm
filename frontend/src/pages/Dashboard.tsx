import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'
import type { DocumentItem, MyTask } from '../api/types'
import { ProcessStatusBadge } from '../components/StatusBadge'
import { useAuth } from '../auth'

interface Counters {
  active_tasks: number
  overdue_tasks: number
  unread_notifications: number
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatCard({
  title,
  value,
  to,
  color,
}: {
  title: string
  value: number
  to?: string
  color?: string
}) {
  const content = (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color: color ?? 'text.primary' }}>
        {value}
      </Typography>
    </Paper>
  )
  if (!to) return content
  return (
    <Link component={RouterLink} to={to} underline="none">
      {content}
    </Link>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const [counters, setCounters] = useState<Counters | null>(null)
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [documents, setDocuments] = useState<DocumentItem[]>([])

  useEffect(() => {
    api<Counters>('/api/my/counters').then(setCounters)
    api<MyTask[]>('/api/tasks/my').then(setTasks)
    api<DocumentItem[]>('/api/documents').then((docs) =>
      setDocuments(docs.filter((d) => d.author_id === user?.id).slice(0, 6)),
    )
  }, [user])

  if (counters === null) return null

  const now = Date.now()
  const inProgress = documents.filter(
    (d) => d.process?.status === 'IN_PROGRESS',
  ).length
  const rejected = documents.filter((d) => d.process?.status === 'REJECTED').length

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Главная
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          mb: 2,
          gridTemplateColumns:
            'repeat(auto-fill, minmax(max(200px, calc(25% - 16px)), 1fr))',
        }}
      >
        <StatCard title="Мне на согласование" value={counters.active_tasks} to="/tasks" />
        <StatCard
          title="Просрочено у меня"
          value={counters.overdue_tasks}
          to="/tasks"
          color={counters.overdue_tasks > 0 ? '#c62828' : undefined}
        />
        <StatCard title="Мои документы в работе" value={inProgress} />
        <StatCard
          title="Отклонённые (требуют внимания)"
          value={rejected}
          color={rejected > 0 ? '#c62828' : undefined}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        }}
      >
        <Paper sx={{ p: 2 }}>
          <Stack
            direction="row"
            sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography variant="h6">Мои задачи</Typography>
            <Link component={RouterLink} to="/tasks">все</Link>
          </Stack>
          {tasks.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              Активных задач нет
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Документ</TableCell>
                  <TableCell>Инициатор</TableCell>
                  <TableCell>Срок</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.slice(0, 6).map((task) => {
                  const overdue =
                    task.due_at !== null &&
                    new Date(task.due_at + 'Z').getTime() < now
                  return (
                    <TableRow key={task.id} hover>
                      <TableCell>
                        <Link component={RouterLink} to={`/process/${task.process_id}`}>
                          {task.subject ?? task.doc_number ?? 'Документ'}
                        </Link>
                      </TableCell>
                      <TableCell>{task.initiator_name ?? '—'}</TableCell>
                      <TableCell sx={overdue ? { color: 'error.main', fontWeight: 600 } : undefined}>
                        {formatDateTime(task.due_at)}
                        {overdue && ' · просрочено'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack
            direction="row"
            sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography variant="h6">Мои последние документы</Typography>
          </Stack>
          {documents.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              Документов пока нет
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Номер</TableCell>
                  <TableCell>Тема</TableCell>
                  <TableCell>Статус</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id} hover>
                    <TableCell>{document.number}</TableCell>
                    <TableCell>
                      {document.process ? (
                        <Link
                          component={RouterLink}
                          to={`/process/${document.process.id}`}
                        >
                          {document.subject}
                        </Link>
                      ) : (
                        document.subject
                      )}
                    </TableCell>
                    <TableCell>
                      {document.process ? (
                        <ProcessStatusBadge status={document.process.status} />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          черновик
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Box>
    </>
  )
}
