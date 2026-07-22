import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import type { ProcessStatus, TaskResult, TaskStatus } from '../api/types'

const PROCESS: Record<ProcessStatus, [string, ChipProps['color']]> = {
  DRAFT: ['Черновик', 'default'],
  IN_PROGRESS: ['На согласовании', 'info'],
  REJECTED: ['Отклонён', 'error'],
  APPROVED: ['Согласован', 'success'],
  PENDING_EXPORT: ['Ожидает выгрузки', 'warning'],
  EXPORTED: ['Выгружен', 'success'],
  CANCELLED: ['Отозван', 'default'],
  FORCE_CLOSED: ['Закрыт администратором', 'default'],
}

export function ProcessStatusBadge({ status }: { status: ProcessStatus }) {
  const [label, color] = PROCESS[status] ?? [status, 'default']
  return <Chip label={label} color={color} size="small" variant="outlined" />
}

const TASK: Record<string, [string, ChipProps['color']]> = {
  PENDING: ['Ожидает очереди', 'default'],
  ACTIVE: ['На рассмотрении', 'info'],
  SKIPPED: ['Пропущена', 'default'],
  CANCELLED: ['Снята', 'default'],
  'COMPLETED:APPROVED': ['Согласовано', 'success'],
  'COMPLETED:AUTO_APPROVED': ['Автосогласовано', 'success'],
  'COMPLETED:REJECTED': ['Отклонено', 'error'],
}

export function TaskStatusBadge({
  status,
  result,
}: {
  status: TaskStatus
  result: TaskResult | null
}) {
  const key = status === 'COMPLETED' ? `COMPLETED:${result}` : status
  const [label, color] = TASK[key] ?? [status, 'default']
  return <Chip label={label} color={color} size="small" variant="outlined" />
}
