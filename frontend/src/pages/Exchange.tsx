import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api/client'

interface ExchangeSetting {
  id: string
  entity_type: string
  name: string
  source_system: string
  can_receive: boolean
  can_send: boolean
  active: boolean
  sort_order: number
}

const SYSTEMS = [
  { value: 'ZUP', label: '1С:ЗУП' },
  { value: 'BUH', label: '1С:Бухгалтерия' },
]

export function ExchangePage() {
  const [rows, setRows] = useState<ExchangeSetting[] | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    api<ExchangeSetting[]>('/api/admin/exchange-settings').then(setRows)
  }, [])

  useEffect(reload, [reload])

  const patch = async (row: ExchangeSetting, changes: Partial<ExchangeSetting>) => {
    setError('')
    // оптимистичное обновление
    setRows((prev) =>
      prev?.map((r) => (r.id === row.id ? { ...r, ...changes } : r)) ?? prev,
    )
    try {
      await api(`/api/admin/exchange-settings/${row.id}`, {
        method: 'PATCH',
        body: changes,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения')
      reload()
    }
  }

  if (rows === null) return null

  return (
    <>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700 }}>
        Обмен справочниками с 1С
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Для каждого справочника — с какой системой идёт обмен и в каком
        направлении. «Получать» — импорт из 1С; «Отправлять» — создание
        объекта в BPM с выгрузкой в 1С. BPM не редактирует данные
        систем-источников, только читает и создаёт новые.
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Интеграции с 1С пока не подключены (система в dev-режиме, справочники
        ведутся вручную). Здесь настраивается план обмена, который заработает
        после подключения ЗУП и Бухгалтерии.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Справочник</TableCell>
              <TableCell width={220}>Система-источник</TableCell>
              <TableCell align="center" width={130}>Получать</TableCell>
              <TableCell align="center" width={130}>Отправлять</TableCell>
              <TableCell align="center" width={110}>Активен</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    variant="standard"
                    value={row.source_system}
                    onChange={(e) => patch(row, { source_system: e.target.value })}
                    sx={{ minWidth: 160 }}
                  >
                    {SYSTEMS.map((s) => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={row.can_receive}
                    onChange={(e) => patch(row, { can_receive: e.target.checked })}
                  />
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={row.can_send}
                    onChange={(e) => patch(row, { can_send: e.target.checked })}
                  />
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={row.active}
                    onChange={(e) => patch(row, { active: e.target.checked })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </>
  )
}
