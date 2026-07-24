import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
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
import { EMPTY_PERIOD, PeriodPicker } from '../components/PeriodPicker'
import type { Period } from '../components/PeriodPicker'

const PAGE = 100

interface ErrorRow {
  id: string
  code: string
  source: string
  method: string | null
  path: string | null
  message: string
  traceback: string | null
  user_name: string | null
  ip: string | null
  created_at: string
}

function formatDateTime(value: string): string {
  return new Date(value + 'Z').toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function ErrorsPage() {
  const [rows, setRows] = useState<ErrorRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [filterSource, setFilterSource] = useState('')
  const [period, setPeriod] = useState<Period>(EMPTY_PERIOD)
  const [detail, setDetail] = useState<ErrorRow | null>(null)

  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
      if (filterSource) params.set('source', filterSource)
      if (period.from) params.set('date_from', period.from)
      if (period.to) params.set('date_to', period.to)
      return params
    },
    [filterSource, period],
  )

  useEffect(() => {
    api<ErrorRow[]>(`/api/admin/errors?${buildParams(0)}`).then((data) => {
      setRows(data)
      setHasMore(data.length === PAGE)
    })
  }, [buildParams])

  const loadMore = async () => {
    const more = await api<ErrorRow[]>(`/api/admin/errors?${buildParams(rows.length)}`)
    setRows((prev) => [...prev, ...more])
    setHasMore(more.length === PAGE)
  }

  return (
    <>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700 }}>
        Ошибки
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Серверные исключения и ошибки интерфейса. Клик по строке — полный стек.
        Код инцидента показывается пользователю в сообщении об ошибке.
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
            label="Источник"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
          >
            <MenuItem value="">Все</MenuItem>
            <MenuItem value="SERVER">Сервер</MenuItem>
            <MenuItem value="CLIENT">Интерфейс</MenuItem>
          </TextField>
          <PeriodPicker value={period} onChange={setPeriod} width="100%" />
          {(filterSource !== '' || period.from !== null || period.to !== null) && (
            <Button
              sx={{ justifySelf: 'start' }}
              onClick={() => {
                setFilterSource('')
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
            Ошибок нет 🎉
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Когда</TableCell>
                <TableCell>Код</TableCell>
                <TableCell>Источник</TableCell>
                <TableCell>Пользователь</TableCell>
                <TableCell>Путь</TableCell>
                <TableCell>Сообщение</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  onClick={() => setDetail(row)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.code}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={row.source === 'SERVER' ? 'error' : 'warning'}
                      label={row.source === 'SERVER' ? 'Сервер' : 'Интерфейс'}
                    />
                  </TableCell>
                  <TableCell>{row.user_name ?? '—'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {row.method ? `${row.method} ` : ''}{row.path ?? '—'}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 380 }}>
                    <Typography variant="body2" noWrap>{row.message}</Typography>
                  </TableCell>
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

      <Dialog
        open={detail !== null}
        onClose={() => setDetail(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {detail?.code} · {detail && formatDateTime(detail.created_at)}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>{detail?.message}</Typography>
          {detail?.traceback ? (
            <Box
              component="pre"
              sx={{
                p: 1.5,
                bgcolor: (t) => (t.palette.mode === 'dark' ? '#2a251d' : '#f6f0e2'),
                borderRadius: 2,
                fontSize: 12,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {detail.traceback}
            </Box>
          ) : (
            <Typography color="text.secondary">Стек не записан</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
