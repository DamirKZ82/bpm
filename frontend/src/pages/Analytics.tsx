import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { AnalyticsSummary, ProcessStatus } from '../api/types'
import { ProcessStatusBadge } from '../components/StatusBadge'

/** Часы → человекочитаемо: «2 ч 15 м», «1.5 дн», «40 м». */
function formatHours(hours: number): string {
  if (hours <= 0) return '—'
  if (hours >= 24) return `${(hours / 24).toFixed(1)} дн`
  if (hours >= 1) {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return m ? `${h} ч ${m} м` : `${h} ч`
  }
  return `${Math.round(hours * 60)} м`
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'default' | 'error' | 'success'
}) {
  const color =
    tone === 'error' ? 'error.main' : tone === 'success' ? 'success.main' : 'text.primary'
  return (
    <Paper sx={{ p: 2.5, flex: '1 1 180px', minWidth: 180 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  )
}

/** Горизонтальная полоса относительно максимума ряда. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <LinearProgress
      variant="determinate"
      value={pct}
      sx={{ height: 8, borderRadius: 4, my: 0.5 }}
    />
  )
}

export function AnalyticsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<AnalyticsSummary | null>(null)

  useEffect(() => {
    api<AnalyticsSummary>('/api/analytics/summary').then(setData)
  }, [])

  if (!data) return null

  const onTime =
    data.tasks.on_time_rate === null
      ? '—'
      : `${Math.round(data.tasks.on_time_rate * 100)}%`
  const maxCycle = Math.max(1, ...data.cycle_time.map((c) => c.avg_hours))
  const maxBottleneck = Math.max(1, ...data.bottlenecks.map((b) => b.avg_hours))
  const maxStatus = Math.max(1, ...Object.values(data.processes.by_status))

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        {t('nav.analytics')}
      </Typography>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <StatCard label="Процессов всего" value={String(data.processes.total)} />
        <StatCard
          label="Запущено за 30 дней"
          value={String(data.processes.started_30d)}
        />
        <StatCard
          label="Завершено за 30 дней"
          value={String(data.processes.completed_30d)}
        />
        <StatCard label="Активных задач" value={String(data.tasks.active)} />
        <StatCard
          label="Просрочено сейчас"
          value={String(data.tasks.active_overdue)}
          tone={data.tasks.active_overdue > 0 ? 'error' : 'success'}
        />
        <StatCard
          label="Соблюдение срока"
          value={onTime}
          tone={
            data.tasks.on_time_rate !== null && data.tasks.on_time_rate < 0.8
              ? 'error'
              : 'success'
          }
        />
      </Stack>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2, alignItems: 'stretch' }}>
        <Paper sx={{ p: 2.5, flex: '1 1 340px', minWidth: 320 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Процессы по статусам
          </Typography>
          {Object.entries(data.processes.by_status)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <Box key={status} sx={{ mb: 1 }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <ProcessStatusBadge status={status as ProcessStatus} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {count}
                  </Typography>
                </Stack>
                <Bar value={count} max={maxStatus} />
              </Box>
            ))}
        </Paper>

        <Paper sx={{ p: 2.5, flex: '1 1 340px', minWidth: 320 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Среднее время цикла
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            От запуска до завершения, по видам документов
          </Typography>
          {data.cycle_time.length === 0 ? (
            <Typography color="text.secondary">Нет завершённых процессов</Typography>
          ) : (
            data.cycle_time.map((c) => (
              <Box key={c.object_type} sx={{ mb: 1 }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
                >
                  <Typography variant="body2">{c.label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatHours(c.avg_hours)}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}· {c.count}
                    </Typography>
                  </Typography>
                </Stack>
                <Bar value={c.avg_hours} max={maxCycle} />
              </Box>
            ))
          )}
        </Paper>
      </Stack>

      <Paper sx={{ p: 2.5, mt: 2 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Узкие места по должностям
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Среднее время на задаче от активации до решения — где процессы задерживаются
        </Typography>
        {data.bottlenecks.length === 0 ? (
          <Typography color="text.secondary">Недостаточно данных</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Должность</TableCell>
                <TableCell width="40%">Среднее время</TableCell>
                <TableCell align="right">Задач</TableCell>
                <TableCell align="right">Просрочено</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.bottlenecks.map((b) => (
                <TableRow key={b.position_id ?? 'adhoc'} hover>
                  <TableCell>{b.position_name}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Bar value={b.avg_hours} max={maxBottleneck} />
                      </Box>
                      <Typography variant="body2" sx={{ minWidth: 72, textAlign: 'right' }}>
                        {formatHours(b.avg_hours)}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{b.count}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: b.overdue > 0 ? 'error.main' : 'text.secondary' }}
                  >
                    {b.overdue}
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
