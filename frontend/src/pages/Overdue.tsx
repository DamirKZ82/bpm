import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'

interface OverdueTask {
  task_id: string
  process_id: string
  doc_number: string | null
  subject: string | null
  stage_no: number
  position_name: string | null
  assignee_name: string | null
  initiator_name: string | null
  due_at: string
  overdue_hours: number
}

function formatDateTime(value: string): string {
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function overdueLabel(hours: number): string {
  if (hours < 24) return `${hours} ч`
  return `${Math.floor(hours / 24)} дн ${hours % 24} ч`
}

export function OverduePage() {
  const [tasks, setTasks] = useState<OverdueTask[] | null>(null)

  useEffect(() => {
    api<OverdueTask[]>('/api/admin/overdue-tasks').then(setTasks)
  }, [])

  if (tasks === null) return null

  return (
    <>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700 }}>
        Просроченные задачи
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Активные задачи согласования с истёкшим сроком — по всем процессам
      </Typography>
      <Paper>
        {tasks.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            Просроченных задач нет 🎉
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Документ</TableCell>
                <TableCell>Этап</TableCell>
                <TableCell>Должность</TableCell>
                <TableCell>Исполнитель</TableCell>
                <TableCell>Инициатор</TableCell>
                <TableCell>Срок истёк</TableCell>
                <TableCell>Просрочка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.task_id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/process/${task.process_id}`}>
                      {task.doc_number} {task.subject}
                    </Link>
                  </TableCell>
                  <TableCell>{task.stage_no}</TableCell>
                  <TableCell>{task.position_name ?? '—'}</TableCell>
                  <TableCell>{task.assignee_name ?? '—'}</TableCell>
                  <TableCell>{task.initiator_name ?? '—'}</TableCell>
                  <TableCell>{formatDateTime(task.due_at)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color="error"
                      variant="outlined"
                      label={overdueLabel(task.overdue_hours)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </>
  )
}
