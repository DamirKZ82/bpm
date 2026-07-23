import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'
import type { User } from '../api/types'
import { AUDIT_LABELS } from '../auditLabels'
import { EMPTY_PERIOD, PeriodPicker } from '../components/PeriodPicker'
import type { Period } from '../components/PeriodPicker'

const PAGE = 100

interface AuditRow {
  id: string
  created_at: string
  user_name: string | null
  action: string
  process_id: string | null
  doc_number: string | null
  subject: string | null
  comment: string | null
  ip: string | null
}

function formatDateTime(value: string): string {
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [period, setPeriod] = useState<Period>(EMPTY_PERIOD)

  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
      if (filterUser) params.set('user_id', filterUser)
      if (filterAction) params.set('action', filterAction)
      if (period.from) params.set('date_from', period.from)
      if (period.to) params.set('date_to', period.to)
      return params
    },
    [filterUser, filterAction, period],
  )

  useEffect(() => {
    api<AuditRow[]>(`/api/admin/audit?${buildParams(0)}`).then((data) => {
      setRows(data)
      setHasMore(data.length === PAGE)
    })
  }, [buildParams])

  useEffect(() => {
    api<User[]>('/api/admin/users').then(setUsers)
  }, [])

  const loadMore = async () => {
    const more = await api<AuditRow[]>(`/api/admin/audit?${buildParams(rows.length)}`)
    setRows((prev) => [...prev, ...more])
    setHasMore(more.length === PAGE)
  }

  const hasFilters =
    filterUser !== '' || filterAction !== '' || period.from !== null || period.to !== null

  return (
    <>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700 }}>
        Журнал аудита
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Все действия по процессам согласования: кто, когда, что, комментарий, IP
      </Typography>

      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            alignItems: 'center',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(max(210px, calc(20% - 12px)), 1fr))',
          }}
        >
          <TextField
            select
            label="Пользователь"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <MenuItem value="">Все</MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.display_name ?? u.ad_sam_account_name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Действие"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <MenuItem value="">Все</MenuItem>
            {Object.entries(AUDIT_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>
          <PeriodPicker value={period} onChange={setPeriod} width="100%" />
          {hasFilters && (
            <Button
              sx={{ justifySelf: 'start' }}
              onClick={() => {
                setFilterUser('')
                setFilterAction('')
                setPeriod(EMPTY_PERIOD)
              }}
            >
              Сбросить
            </Button>
          )}
        </Box>
      </Paper>

      <Paper>
        {rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            Записей нет
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Когда</TableCell>
                <TableCell>Кто</TableCell>
                <TableCell>Действие</TableCell>
                <TableCell>Документ</TableCell>
                <TableCell>Комментарий</TableCell>
                <TableCell>IP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell>{row.user_name ?? 'Система'}</TableCell>
                  <TableCell>{AUDIT_LABELS[row.action] ?? row.action}</TableCell>
                  <TableCell>
                    {row.process_id ? (
                      <Link component={RouterLink} to={`/process/${row.process_id}`}>
                        {row.doc_number} {row.subject}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {row.comment ?? ''}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{row.ip ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hasMore && (
          <Stack sx={{ p: 1.5, alignItems: 'center' }}>
            <Button onClick={loadMore}>Показать ещё</Button>
          </Stack>
        )}
      </Paper>
    </>
  )
}
