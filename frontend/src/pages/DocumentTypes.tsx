import { useCallback, useEffect, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api/client'
import type { DictionaryRef } from '../api/types'

const FIELD_TYPES = [
  { value: 'STRING', label: 'Строка' },
  { value: 'TEXT', label: 'Текст (многострочный)' },
  { value: 'NUMBER', label: 'Число' },
  { value: 'MONEY', label: 'Деньги' },
  { value: 'DATE', label: 'Дата' },
  { value: 'BOOLEAN', label: 'Да / Нет' },
  { value: 'REF', label: 'Ссылка на справочник' },
]

const REF_TARGETS = [
  { value: 'EMPLOYEE', label: 'Сотрудники' },
  { value: 'ORGANIZATION', label: 'Организации' },
  { value: 'PROJECT', label: 'Проекты' },
  { value: 'DICTIONARY', label: 'Пользовательский справочник' },
]

interface FieldRow {
  id?: string
  code: string
  name: string
  field_type: string
  ref_target: string | null
  dictionary_id: string | null
  required: boolean
}

interface DocType {
  id: string
  code: string
  name: string
  prefix: string
  is_system: boolean
  active: boolean
  last_number: number
  fields: FieldRow[]
}

type Draft = Omit<DocType, 'id' | 'code' | 'is_system' | 'last_number'> & {
  id?: string
  is_system?: boolean
}

const newField = (): FieldRow => ({
  code: `f_${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  field_type: 'STRING',
  ref_target: null,
  dictionary_id: null,
  required: false,
})

export function DocumentTypesPage() {
  const [types, setTypes] = useState<DocType[] | null>(null)
  const [dictionaries, setDictionaries] = useState<DictionaryRef[]>([])
  const [editing, setEditing] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    api<DocType[]>('/api/admin/document-types').then(setTypes)
    api<DictionaryRef[]>('/api/refs/dictionaries').then(setDictionaries)
  }, [])

  useEffect(reload, [reload])

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const body = {
        name: editing.name,
        prefix: editing.prefix,
        active: editing.active,
        fields: editing.fields,
      }
      if (editing.id) {
        await api(`/api/admin/document-types/${editing.id}`, { method: 'PUT', body })
      } else {
        await api('/api/admin/document-types', { method: 'POST', body })
      }
      setEditing(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (docType: DocType) => {
    if (!confirm(`Удалить вид «${docType.name}»?`)) return
    setListError('')
    try {
      await api(`/api/admin/document-types/${docType.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка удаления')
    }
  }

  const patchField = (index: number, patch: Partial<FieldRow>) => {
    if (!editing) return
    setEditing({
      ...editing,
      fields: editing.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    })
  }

  if (types === null) return null

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Виды документов
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Стандартные реквизиты (номер, дата, организация, проект, тема,
            содержание, вложения) есть у каждого вида; здесь настраиваются
            дополнительные поля. Маршрут вида задаётся в матрице согласования.
          </Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing({ name: '', prefix: '', active: true, fields: [] })
            setError('')
          }}
        >
          Новый вид
        </Button>
      </Stack>
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

      <Stack spacing={2}>
        {types.map((docType) => (
          <Paper key={docType.id} sx={{ p: 2.5 }}>
            <Stack
              direction="row"
              sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}
            >
              <div>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="h6">{docType.name}</Typography>
                  <Chip size="small" variant="outlined" label={`${docType.prefix}-…`} />
                  {docType.is_system && (
                    <Chip size="small" variant="outlined" color="info" label="системный" />
                  )}
                  {!docType.active && (
                    <Chip size="small" variant="outlined" color="warning" label="неактивен" />
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {docType.fields.length
                    ? docType.fields
                        .map((f) => `${f.name}${f.required ? ' *' : ''}`)
                        .join(' · ')
                    : 'Дополнительных полей нет'}
                </Typography>
              </div>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setEditing(JSON.parse(JSON.stringify(docType)))
                    setError('')
                  }}
                >
                  Изменить
                </Button>
                {!docType.is_system && (
                  <Button size="small" variant="outlined" onClick={() => remove(docType)}>
                    Удалить
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {editing?.id ? 'Вид документа' : 'Новый вид документа'}
        </DialogTitle>
        <DialogContent>
          {editing && (
            <>
              <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 2 }}>
                <TextField
                  label="Название"
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <TextField
                  label="Префикс номера"
                  required
                  sx={{ width: 160, flexShrink: 0 }}
                  value={editing.prefix}
                  onChange={(e) => setEditing({ ...editing, prefix: e.target.value })}
                />
                <FormControlLabel
                  sx={{ flexShrink: 0 }}
                  control={
                    <Checkbox
                      checked={editing.active}
                      onChange={(e) =>
                        setEditing({ ...editing, active: e.target.checked })
                      }
                    />
                  }
                  label="Активен"
                />
              </Stack>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Дополнительные поля
              </Typography>
              {editing.fields.map((field, index) => (
                <Paper
                  key={field.code}
                  sx={{
                    p: 1.5, mb: 1.5,
                    bgcolor: (t) => (t.palette.mode === 'dark' ? '#2a251d' : '#f6f0e2'),
                  }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <TextField
                      label="Название поля"
                      size="small"
                      required
                      sx={{ flexGrow: 1 }}
                      value={field.name}
                      onChange={(e) => patchField(index, { name: e.target.value })}
                    />
                    <TextField
                      select
                      label="Тип"
                      size="small"
                      sx={{ width: 220, flexShrink: 0 }}
                      value={field.field_type}
                      onChange={(e) =>
                        patchField(index, {
                          field_type: e.target.value,
                          ref_target:
                            e.target.value === 'REF' ? field.ref_target ?? 'EMPLOYEE' : null,
                          dictionary_id: null,
                        })
                      }
                    >
                      {FIELD_TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                      ))}
                    </TextField>
                    <FormControlLabel
                      sx={{ flexShrink: 0, mr: 0 }}
                      control={
                        <Checkbox
                          size="small"
                          checked={field.required}
                          onChange={(e) =>
                            patchField(index, { required: e.target.checked })
                          }
                        />
                      }
                      label="Обязательное"
                    />
                    <Tooltip title="Удалить поле">
                      <IconButton
                        size="small"
                        sx={{ flexShrink: 0 }}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            fields: editing.fields.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  {field.field_type === 'REF' && (
                    <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
                      <TextField
                        select
                        label="Справочник"
                        size="small"
                        sx={{ width: 260, flexShrink: 0 }}
                        value={field.ref_target ?? ''}
                        onChange={(e) =>
                          patchField(index, {
                            ref_target: e.target.value,
                            dictionary_id: null,
                          })
                        }
                      >
                        {REF_TARGETS.map((t) => (
                          <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                        ))}
                      </TextField>
                      {field.ref_target === 'DICTIONARY' && (
                        <TextField
                          select
                          label="Какой справочник"
                          size="small"
                          sx={{ width: 260, flexShrink: 0 }}
                          value={field.dictionary_id ?? ''}
                          onChange={(e) =>
                            patchField(index, { dictionary_id: e.target.value || null })
                          }
                        >
                          {dictionaries.map((d) => (
                            <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                          ))}
                        </TextField>
                      )}
                    </Stack>
                  )}
                </Paper>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  setEditing({ ...editing, fields: [...editing.fields, newField()] })
                }
              >
                Добавить поле
              </Button>
              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={
              busy ||
              !(editing?.name ?? '').trim() ||
              !(editing?.prefix ?? '').trim() ||
              (editing?.fields ?? []).some((f) => !f.name.trim()) ||
              (editing?.fields ?? []).some(
                (f) =>
                  f.field_type === 'REF' &&
                  f.ref_target === 'DICTIONARY' &&
                  !f.dictionary_id,
              )
            }
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
