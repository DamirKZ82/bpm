import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import { useTranslation } from 'react-i18next'
import type { ProcessStatus, TaskResult, TaskStatus } from '../api/types'

const PROCESS_COLOR: Record<ProcessStatus, ChipProps['color']> = {
  DRAFT: 'default',
  IN_PROGRESS: 'info',
  REJECTED: 'error',
  APPROVED: 'success',
  PENDING_EXPORT: 'warning',
  EXPORTED: 'success',
  CANCELLED: 'default',
  FORCE_CLOSED: 'default',
}

export function ProcessStatusBadge({ status }: { status: ProcessStatus }) {
  const { t } = useTranslation()
  return (
    <Chip
      label={t(`status.${status}`)}
      color={PROCESS_COLOR[status] ?? 'default'}
      size="small"
      variant="outlined"
    />
  )
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
