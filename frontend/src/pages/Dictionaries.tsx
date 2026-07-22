import { useCallback, useEffect, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api/client'

interface DictionaryItemRow {
  id?: string
  name: string
  active: boolean
}

interface DictionaryRow {
  id?: string
  name: string
  active: boolean
  items: DictionaryItemRow[]
}

export function DictionariesPage() {
  const [dictionaries, setDictionaries] = useState<DictionaryRow[] | null>(null)
  const [editing, setEditing] = useState<DictionaryRow | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    api<DictionaryRow[]>('/api/admin/dictionaries').then(setDictionaries)
  }, [])

  useEffect(reload, [reload])

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const body = {
        name: editing.name,
        active: editing.active,
        items: editing.items,
      }
      if (editing.id) {
        await api(`/api/admin/dictionaries/${editing.id}`, { method: 'PUT', body })
      } else {
        await api('/api/admin/dictionaries', { method: 'POST', body })
      }
      setEditing(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (dictionary: DictionaryRow) => {
    if (!confirm(`Удалить справочник «${dictionary.name}»?`)) return
    setListError('')
    try {
      await api(`/api/admin/dictionaries/${dictionary.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка удаления')
    }
  }

  if (dictionaries === null) return null

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Пользовательские справочники
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Списки значений для ссылочных полей видов документов
          </Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing({ name: '', active: true, items: [] })
            setError('')
          }}
        >
          Новый справочник
        </Button>
      </Stack>
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

      <Stack spacing={2}>
        {dictionaries.length === 0 && (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Справочников пока нет</Typography>
          </Paper>
        )}
        {dictionaries.map((dictionary) => (
          <Paper key={dictionary.id} sx={{ p: 2.5 }}>
            <Stack
              direction="row"
              sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
            >
              <div>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="h6">{dictionary.name}</Typography>
                  {!dictionary.active && (
                    <Chip size="small" variant="outlined" color="warning" label="неактивен" />
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {dictionary.items.length
                    ? dictionary.items.map((i) => i.name).join(' · ')
                    : 'Пусто'}
                </Typography>
              </div>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setEditing(JSON.parse(JSON.stringify(dictionary)))
                    setError('')
                  }}
                >
                  Изменить
                </Button>
                <Button size="small" variant="outlined" onClick={() => remove(dictionary)}>
                  Удалить
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editing?.id ? 'Справочник' : 'Новый справочник'}
        </DialogTitle>
        <DialogContent>
          {editing && (
            <>
              <TextField
                label="Название"
                required
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                sx={{ mt: 1, mb: 2 }}
              />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Элементы
              </Typography>
              {editing.items.map((item, index) => (
                <Stack
                  key={index}
                  direction="row"
                  spacing={1}
                  sx={{ mb: 1, alignItems: 'center' }}
                >
                  <TextField
                    size="small"
                    value={item.name}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        items: editing.items.map((it, i) =>
                          i === index ? { ...it, name: e.target.value } : it,
                        ),
                      })
                    }
                  />
                  <IconButton
                    size="small"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        items: editing.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <DeleteOutlinedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  setEditing({
                    ...editing,
                    items: [...editing.items, { name: '', active: true }],
                  })
                }
              >
                Добавить элемент
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
              (editing?.items ?? []).some((i) => !i.name.trim())
            }
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
