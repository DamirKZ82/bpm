import { useCallback, useEffect, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef } from '@mui/x-data-grid'
import { ruRU as gridRuRU } from '@mui/x-data-grid/locales'
import { ApiError, api } from '../api/client'

export interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'multiselect'
  required?: boolean
  /** endpoint для загрузки вариантов (select по справочнику) */
  optionsUrl?: string
  /** поле-название в справочнике вариантов */
  optionLabel?: string
  /** статичные варианты */
  options?: { value: string; label: string }[]
  inTable?: boolean
  inForm?: boolean
  editable?: boolean
}

export interface EntityConfig {
  title: string
  endpoint: string
  fields: FieldDef[]
  canDelete?: boolean
  canEdit?: boolean
  hint?: string
  /** привязка к настройке обмена: если справочник только получают из 1С
   * (can_send=false) — он полностью read-only (нельзя менять даже активность) */
  exchangeEntity?: string
}

interface ExchangeSettingRow {
  entity_type: string
  can_receive: boolean
  can_send: boolean
}

type Row = Record<string, unknown> & { id: string }

const GRID_LOCALE = gridRuRU.components.MuiDataGrid.defaultProps.localeText

export function CrudTable({ config }: { config: EntityConfig }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [options, setOptions] = useState<Record<string, Row[]>>({})
  const [editing, setEditing] = useState<Partial<Row> | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)
  // справочник «только получаем из 1С» — полностью read-only
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    if (!config.exchangeEntity) { setReadOnly(false); return }
    api<ExchangeSettingRow[]>('/api/admin/exchange-settings')
      .then((list) => {
        const s = list.find((x) => x.entity_type === config.exchangeEntity)
        setReadOnly(!!s && s.can_receive && !s.can_send)
      })
      .catch(() => setReadOnly(false))
  }, [config.exchangeEntity])

  const reload = useCallback(() => {
    setListError('')
    api<Row[]>(config.endpoint).then(setRows).catch((err) =>
      setListError(err instanceof ApiError ? err.message : 'Ошибка загрузки'),
    )
  }, [config.endpoint])

  useEffect(() => {
    setRows(null)
    reload()
  }, [reload])

  useEffect(() => {
    const urls = [...new Set(
      config.fields.filter((f) => f.optionsUrl).map((f) => f.optionsUrl as string),
    )]
    urls.forEach((url) => {
      api<Row[]>(url).then((data) => setOptions((prev) => ({ ...prev, [url]: data })))
    })
  }, [config])

  const labelFor = useMemo(() => {
    return (field: FieldDef, value: unknown): string => {
      if (value === null || value === undefined || value === '') return '—'
      if (field.type === 'checkbox') return value ? 'Да' : 'Нет'
      if (field.type === 'multiselect' && Array.isArray(value)) {
        return value
          .map((v) => field.options?.find((o) => o.value === v)?.label ?? String(v))
          .join(', ')
      }
      if (field.options) {
        return field.options.find((o) => o.value === value)?.label ?? String(value)
      }
      if (field.optionsUrl) {
        const list = options[field.optionsUrl] ?? []
        const found = list.find((o) => o.id === value)
        return found ? String(found[field.optionLabel ?? 'name']) : String(value)
      }
      return String(value)
    }
  }, [options])

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const formFields = config.fields.filter((f) => f.inForm !== false)
      const body: Record<string, unknown> = {}
      for (const field of formFields) {
        if (editing.id && field.editable === false) continue
        let value = editing[field.key]
        if (value === '' || value === undefined) value = null
        if (field.type === 'number' && value !== null) value = Number(value)
        if (field.required && (value === null || (Array.isArray(value) && !value.length))) {
          throw new ApiError(0, `Заполните поле «${field.label}»`)
        }
        body[field.key] = value
      }
      if (editing.id) {
        await api(`${config.endpoint}/${editing.id}`, { method: 'PATCH', body })
      } else {
        await api(config.endpoint, { method: 'POST', body })
      }
      setEditing(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: Row) => {
    if (!confirm('Удалить запись?')) return
    setListError('')
    try {
      await api(`${config.endpoint}/${row.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка удаления')
    }
  }

  const canEdit = config.canEdit !== false && !readOnly
  const canDelete = config.canDelete !== false && !readOnly
  const tableFields = config.fields.filter((f) => f.inTable !== false)
  const formFields = config.fields.filter((f) => f.inForm !== false)

  const columns: GridColDef[] = [
    ...tableFields.map((field): GridColDef => ({
      field: field.key,
      headerName: field.label,
      flex: 1,
      minWidth: 110,
      renderCell: (params) => labelFor(field, params.row[field.key]),
    })),
    {
      field: '__actions',
      headerName: '',
      width: 100,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          {canEdit && (
            <IconButton
              size="small"
              onClick={() => { setEditing(params.row as Row); setError('') }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          {canDelete && (
            <IconButton size="small" onClick={() => remove(params.row as Row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ),
    },
  ]

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <Typography variant="h6">{config.title}</Typography>
          {config.hint && (
            <Typography variant="body2" color="text.secondary">
              {config.hint}
            </Typography>
          )}
        </div>
        {!readOnly && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setEditing({}); setError('') }}
          >
            Создать
          </Button>
        )}
      </Stack>
      {readOnly && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Справочник только получается из 1С — изменение недоступно.
          Данные (в том числе активность) ведутся в системе-источнике.
          Режим приёма/отправки настраивается в разделе «Обмен с 1С».
        </Alert>
      )}
      {listError && <Alert severity="error" sx={{ mb: 1.5 }}>{listError}</Alert>}
      <Paper sx={{ height: 'calc(100vh - 170px)', minHeight: 420 }}>
        <DataGrid
          rows={rows ?? []}
          columns={columns}
          loading={rows === null}
          density="compact"
          disableRowSelectionOnClick
          localeText={GRID_LOCALE}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 0 }}
        />
      </Paper>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.id ? 'Изменить запись' : 'Новая запись'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formFields.map((field) => {
              const disabled = Boolean(editing?.id) && field.editable === false
              const value = editing?.[field.key]
              const update = (v: unknown) => setEditing({ ...editing, [field.key]: v })

              if (field.type === 'checkbox') {
                return (
                  <FormControlLabel
                    key={field.key}
                    control={
                      <Checkbox
                        checked={Boolean(value)}
                        disabled={disabled}
                        onChange={(e) => update(e.target.checked)}
                      />
                    }
                    label={field.label}
                  />
                )
              }
              if (field.type === 'multiselect') {
                return (
                  <div key={field.key}>
                    <Typography variant="body2" color="text.secondary">
                      {field.label}{field.required ? ' *' : ''}
                    </Typography>
                    <FormGroup row>
                      {(field.options ?? []).map((opt) => {
                        const selected = Array.isArray(value) && value.includes(opt.value)
                        return (
                          <FormControlLabel
                            key={opt.value}
                            control={
                              <Checkbox
                                size="small"
                                checked={selected}
                                disabled={disabled}
                                onChange={(e) => {
                                  const current = Array.isArray(value) ? (value as string[]) : []
                                  update(
                                    e.target.checked
                                      ? [...current, opt.value]
                                      : current.filter((v) => v !== opt.value),
                                  )
                                }}
                              />
                            }
                            label={opt.label}
                          />
                        )
                      })}
                    </FormGroup>
                  </div>
                )
              }
              if (field.options || field.optionsUrl) {
                return (
                  <TextField
                    key={field.key}
                    select
                    label={field.label}
                    required={field.required}
                    value={value == null ? '' : String(value)}
                    disabled={disabled}
                    onChange={(e) => update(e.target.value || null)}
                  >
                    <MenuItem value="">—</MenuItem>
                    {field.options
                      ? field.options.map((o) => (
                          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                        ))
                      : (options[field.optionsUrl ?? ''] ?? []).map((o) => (
                          <MenuItem key={o.id} value={o.id}>
                            {String(o[field.optionLabel ?? 'name'])}
                          </MenuItem>
                        ))}
                  </TextField>
                )
              }
              return (
                <TextField
                  key={field.key}
                  type={field.type ?? 'text'}
                  label={field.label}
                  required={field.required}
                  value={value == null ? '' : String(value)}
                  disabled={disabled}
                  onChange={(e) => update(e.target.value)}
                  slotProps={
                    field.type === 'date'
                      ? { inputLabel: { shrink: true } }
                      : undefined
                  }
                />
              )
            })}
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Отмена</Button>
          <Button variant="contained" onClick={save} disabled={busy}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
