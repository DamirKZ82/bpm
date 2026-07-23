import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
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
import { ApiError, api } from '../api/client'
import type { DocumentItem, DocumentTypeRef } from '../api/types'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import { Attachments } from '../components/Attachments'
import { CustomFieldInputs, refOptions, useRefsData } from '../components/CustomFields'
import { EMPTY_PERIOD, PeriodPicker } from '../components/PeriodPicker'
import type { Period } from '../components/PeriodPicker'
import { ProcessStatusBadge } from '../components/StatusBadge'
import { RoutePreview } from '../components/RoutePreview'
import { useAuth } from '../auth'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function DocumentsPage() {
  const { typeCode = 'MEMO' } = useParams()
  const { user } = useAuth()
  const refs = useRefsData(true)
  const [docTypes, setDocTypes] = useState<DocumentTypeRef[]>([])
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null)
  const [editing, setEditing] = useState<Partial<DocumentItem> | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  // отбор списка: организация, проект, период по дате документа
  const [filterOrg, setFilterOrg] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [period, setPeriod] = useState<Period>(EMPTY_PERIOD)
  // отбор по настраиваемым полям вида: код поля (или код_from/_to) -> значение
  const [cfFilters, setCfFilters] = useState<Record<string, string>>({})

  const docType = useMemo(
    () => docTypes.find((t) => t.code === typeCode) ?? null,
    [docTypes, typeCode],
  )

  const reload = useCallback(() => {
    const params = new URLSearchParams({ type_code: typeCode })
    if (filterOrg) params.set('organization_id', filterOrg)
    if (filterProject) params.set('project_id', filterProject)
    if (period.from) params.set('date_from', period.from)
    if (period.to) params.set('date_to', period.to)
    for (const [key, value] of Object.entries(cfFilters)) {
      if (value !== '') params.set(`cf_${key}`, value)
    }
    api<DocumentItem[]>(`/api/documents?${params}`).then(setDocuments)
  }, [typeCode, filterOrg, filterProject, period, cfFilters])

  useEffect(() => {
    setDocuments(null)
    reload()
  }, [reload])

  useEffect(() => {
    api<DocumentTypeRef[]>('/api/refs/document-types').then(setDocTypes)
  }, [])

  useEffect(() => setCfFilters({}), [typeCode])

  const hasFilters =
    filterOrg !== '' ||
    filterProject !== '' ||
    period.from !== null ||
    period.to !== null ||
    Object.values(cfFilters).some((v) => v !== '')
  const setCf = (key: string, value: string) =>
    setCfFilters((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const body = {
        subject: editing.subject ?? '',
        body: editing.body ?? '',
        date: editing.date ?? today(),
        organization_id: editing.organization_id,
        project_id: editing.project_id,
        custom_fields: editing.custom_fields ?? {},
      }
      if (editing.id) {
        await api(`/api/documents/${editing.id}`, { method: 'PATCH', body })
        setEditing(null)
      } else {
        // после создания диалог остаётся открытым — можно добавить вложения
        const saved = await api<DocumentItem>('/api/documents', {
          method: 'POST',
          body: { ...body, type_code: typeCode },
        })
        setEditing(saved)
      }
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const submitForApproval = async (document: DocumentItem) => {
    setListError('')
    try {
      await api(`/api/documents/${document.id}/submit`, { method: 'POST', body: {} })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  const remove = async (document: DocumentItem) => {
    if (!confirm(`Удалить черновик «${document.subject}»?`)) return
    setListError('')
    try {
      await api(`/api/documents/${document.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  if (documents === null) return null

  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const canCreate = user?.employee_id != null
  const isMine = (document: DocumentItem) => document.author_id === user?.id
  const isEditable = (document: DocumentItem) =>
    !document.process ||
    ['REJECTED', 'CANCELLED', 'FORCE_CLOSED'].includes(document.process.status)

  const readOnly = Boolean(editing?.id) && editing?.author_id !== user?.id
  const projectOptions = refs.projects.filter(
    (p) =>
      !editing?.organization_id ||
      p.organization_id === null ||
      p.organization_id === editing.organization_id,
  )
  const typeName = docType?.name ?? 'Документы'

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {typeName}
          {isAdmin && (
            <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
              (все)
            </Typography>
          )}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled={!canCreate}
          onClick={() => {
            setEditing({
              date: today(),
              organization_id:
                refs.organizations.length === 1 ? refs.organizations[0].id : null,
              custom_fields: {},
            })
            setError('')
          }}
        >
          Создать
        </Button>
      </Stack>
      {!canCreate && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Учётная запись не сопоставлена с сотрудником — создание заявок
          недоступно. Обратитесь к администратору.
        </Alert>
      )}
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

      {/* панель отбора: выровненная сетка, 1-5 колонок по ширине окна */}
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
            label="Организация"
            value={filterOrg}
            onChange={(e) => { setFilterOrg(e.target.value); setFilterProject('') }}
          >
            <MenuItem value="">Все</MenuItem>
            {refs.organizations.map((org) => (
              <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Проект"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <MenuItem value="">Все</MenuItem>
            {refs.projects
              .filter(
                (p) =>
                  !filterOrg ||
                  p.organization_id === null ||
                  p.organization_id === filterOrg,
              )
              .map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.code ? `${project.code} — ${project.name}` : project.name}
                </MenuItem>
              ))}
          </TextField>
          <PeriodPicker value={period} onChange={setPeriod} width="100%" />
          {/* отборы по настраиваемым полям вида */}
          {(docType?.fields ?? [])
            .filter((f) => f.field_type !== 'TEXT')
            .map((field) => {
              switch (field.field_type) {
                case 'BOOLEAN':
                  return (
                    <TextField
                      key={field.id}
                      select
                      label={field.name}
                      value={cfFilters[field.code] ?? ''}
                      onChange={(e) => setCf(field.code, e.target.value)}
                    >
                      <MenuItem value="">Все</MenuItem>
                      <MenuItem value="true">Да</MenuItem>
                      <MenuItem value="false">Нет</MenuItem>
                    </TextField>
                  )
                case 'REF':
                  return (
                    <TextField
                      key={field.id}
                      select
                      label={field.name}
                      value={cfFilters[field.code] ?? ''}
                      onChange={(e) => setCf(field.code, e.target.value)}
                    >
                      <MenuItem value="">Все</MenuItem>
                      {refOptions(field, refs).map((option) => (
                        <MenuItem key={option.id} value={option.id}>
                          {option.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )
                case 'DATE':
                  return (
                    <Stack direction="row" spacing={1} key={field.id}>
                      <TextField
                        type="date"
                        label={`${field.name} с`}
                        value={cfFilters[`${field.code}_from`] ?? ''}
                        onChange={(e) => setCf(`${field.code}_from`, e.target.value)}
                        sx={{ flex: 1 }}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        type="date"
                        label="по"
                        value={cfFilters[`${field.code}_to`] ?? ''}
                        onChange={(e) => setCf(`${field.code}_to`, e.target.value)}
                        sx={{ flex: 1 }}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Stack>
                  )
                case 'NUMBER':
                case 'MONEY':
                  return (
                    <Stack direction="row" spacing={1} key={field.id}>
                      <TextField
                        type="number"
                        label={`${field.name} от`}
                        value={cfFilters[`${field.code}_from`] ?? ''}
                        onChange={(e) => setCf(`${field.code}_from`, e.target.value)}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        type="number"
                        label="до"
                        value={cfFilters[`${field.code}_to`] ?? ''}
                        onChange={(e) => setCf(`${field.code}_to`, e.target.value)}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                  )
                default:
                  return (
                    <TextField
                      key={field.id}
                      label={field.name}
                      value={cfFilters[field.code] ?? ''}
                      onChange={(e) => setCf(field.code, e.target.value)}
                    />
                  )
              }
            })}
          {hasFilters && (
            <Button
              sx={{ justifySelf: 'start' }}
              onClick={() => {
                setFilterOrg('')
                setFilterProject('')
                setPeriod(EMPTY_PERIOD)
                setCfFilters({})
              }}
            >
              Сбросить
            </Button>
          )}
        </Box>
      </Paper>

      <Paper>
        {documents.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            {hasFilters ? 'По заданному отбору ничего не найдено' : 'Документов пока нет'}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Номер</TableCell>
                <TableCell>Тема</TableCell>
                {isAdmin && <TableCell>Автор</TableCell>}
                <TableCell>Дата</TableCell>
                <TableCell>Проект</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right" width={310} />
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id} hover>
                  <TableCell>{document.number}</TableCell>
                  <TableCell>
                    {document.process ? (
                      <Link component={RouterLink} to={`/process/${document.process.id}`}>
                        {document.subject}
                      </Link>
                    ) : isMine(document) ? (
                      document.subject
                    ) : (
                      <Link
                        component="button"
                        onClick={() => { setEditing(document); setError('') }}
                      >
                        {document.subject}
                      </Link>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>{document.author_name ?? '—'}</TableCell>
                  )}
                  <TableCell>{formatDate(document.date)}</TableCell>
                  <TableCell>{document.project_name ?? '—'}</TableCell>
                  <TableCell>
                    {document.process ? (
                      <ProcessStatusBadge status={document.process.status} />
                    ) : (
                      <Chip label="Черновик" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      {isMine(document) && isEditable(document) && (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => submitForApproval(document)}
                          >
                            {document.process ? 'Отправить повторно' : 'На согласование'}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => { setEditing(document); setError('') }}
                          >
                            Изменить
                          </Button>
                        </>
                      )}
                      {isMine(document) && !document.process && (
                        <Button size="small" variant="outlined" onClick={() => remove(document)}>
                          Удалить
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="md">
        <DialogTitle>
          {!editing?.id
            ? `${typeName} — новый документ`
            : readOnly
              ? `${editing.number} — ${editing.author_name ?? 'другой автор'}`
              : `${typeName} ${editing.number}`}
        </DialogTitle>
        <DialogContent>
          {/* реквизиты шапки — в один ряд */}
          <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 2 }}>
            <TextField
              label="Номер"
              value={editing?.number ?? ''}
              placeholder="автоматически"
              disabled
              sx={{ width: 170, flexShrink: 0 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Дата"
              type="date"
              value={editing?.date ?? today()}
              onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              disabled={readOnly}
              sx={{ width: 180, flexShrink: 0 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label="Организация"
              required
              value={editing?.organization_id ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  organization_id: e.target.value || null,
                  project_id: null,
                })
              }
              disabled={readOnly}
            >
              {refs.organizations.map((org) => (
                <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Проект"
              required
              value={editing?.project_id ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, project_id: e.target.value || null })
              }
              disabled={readOnly}
            >
              {projectOptions.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.code ? `${project.code} — ${project.name}` : project.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Тема"
            value={editing?.subject ?? ''}
            onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
            disabled={readOnly}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Содержание"
            multiline
            minRows={4}
            value={editing?.body ?? ''}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            disabled={readOnly}
          />
          {(docType?.fields.length ?? 0) > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <CustomFieldInputs
                fields={docType?.fields ?? []}
                values={(editing?.custom_fields ?? {}) as Record<string, unknown>}
                onChange={(values) => setEditing({ ...editing, custom_fields: values })}
                disabled={readOnly}
                refs={refs}
              />
            </>
          )}
          {!readOnly && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Маршрут согласования
              </Typography>
              <RoutePreview
                objectType={typeCode}
                organizationId={editing?.organization_id}
                projectId={editing?.project_id}
              />
            </>
          )}
          {editing?.id ? (
            <>
              <Divider sx={{ my: 2 }} />
              <Attachments memoId={editing.id} canEdit={!readOnly} />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Вложения можно добавить после сохранения
            </Typography>
          )}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          {editing?.id && (
            <Button
              startIcon={<PrintOutlinedIcon />}
              onClick={() => window.open(`/print/${editing.id}`, '_blank')}
              sx={{ mr: 'auto' }}
            >
              Печать
            </Button>
          )}
          <Button onClick={() => setEditing(null)}>Закрыть</Button>
          {!readOnly && (
            <Button
              variant="contained"
              onClick={save}
              disabled={
                busy ||
                !(editing?.subject ?? '').trim() ||
                !(editing?.body ?? '').trim() ||
                !editing?.organization_id ||
                !editing?.project_id
              }
            >
              Сохранить
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  )
}
