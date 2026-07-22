import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
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
import type { Memo, OrganizationRef, ProjectRef } from '../api/types'
import { Attachments } from '../components/Attachments'
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

export function MemosPage() {
  const { user } = useAuth()
  const [memos, setMemos] = useState<Memo[] | null>(null)
  const [organizations, setOrganizations] = useState<OrganizationRef[]>([])
  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [editing, setEditing] = useState<Partial<Memo> | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  // отбор списка: организация, проект, период по дате документа
  const [filterOrg, setFilterOrg] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [period, setPeriod] = useState<Period>(EMPTY_PERIOD)

  const reload = useCallback(() => {
    const params = new URLSearchParams()
    if (filterOrg) params.set('organization_id', filterOrg)
    if (filterProject) params.set('project_id', filterProject)
    if (period.from) params.set('date_from', period.from)
    if (period.to) params.set('date_to', period.to)
    const query = params.toString()
    api<Memo[]>(`/api/memos${query ? `?${query}` : ''}`).then(setMemos)
  }, [filterOrg, filterProject, period])

  useEffect(reload, [reload])

  useEffect(() => {
    api<OrganizationRef[]>('/api/refs/organizations').then(setOrganizations)
    api<ProjectRef[]>('/api/refs/projects').then(setProjects)
  }, [])

  const hasFilters =
    filterOrg !== '' || filterProject !== '' || period.from !== null || period.to !== null

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
      }
      if (editing.id) {
        await api(`/api/memos/${editing.id}`, { method: 'PATCH', body })
        setEditing(null)
      } else {
        // после создания диалог остаётся открытым — можно добавить вложения
        const saved = await api<Memo>('/api/memos', { method: 'POST', body })
        setEditing(saved)
      }
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const submitForApproval = async (memo: Memo) => {
    setListError('')
    try {
      await api(`/api/memos/${memo.id}/submit`, { method: 'POST', body: {} })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  const remove = async (memo: Memo) => {
    if (!confirm(`Удалить черновик «${memo.subject}»?`)) return
    setListError('')
    try {
      await api(`/api/memos/${memo.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка')
    }
  }

  if (memos === null) return null

  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const canCreate = user?.employee_id != null
  const isMine = (memo: Memo) => memo.author_id === user?.id
  const isEditable = (memo: Memo) =>
    !memo.process ||
    ['REJECTED', 'CANCELLED', 'FORCE_CLOSED'].includes(memo.process.status)

  const readOnly = Boolean(editing?.id) && editing?.author_id !== user?.id
  const projectOptions = projects.filter(
    (p) =>
      !editing?.organization_id ||
      p.organization_id === null ||
      p.organization_id === editing.organization_id,
  )

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {isAdmin ? 'Служебные записки (все)' : 'Мои служебные записки'}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled={!canCreate}
          onClick={() => {
            setEditing({
              date: today(),
              organization_id: organizations.length === 1 ? organizations[0].id : null,
            })
            setError('')
          }}
        >
          Новая записка
        </Button>
      </Stack>
      {!canCreate && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Учётная запись не сопоставлена с сотрудником — создание заявок
          недоступно. Обратитесь к администратору.
        </Alert>
      )}
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

      {/* панель отбора */}
      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            select
            label="Организация"
            value={filterOrg}
            onChange={(e) => { setFilterOrg(e.target.value); setFilterProject('') }}
            sx={{ width: 230, flexShrink: 0 }}
          >
            <MenuItem value="">Все</MenuItem>
            {organizations.map((org) => (
              <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Проект"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            sx={{ width: 230, flexShrink: 0 }}
          >
            <MenuItem value="">Все</MenuItem>
            {projects
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
          <PeriodPicker value={period} onChange={setPeriod} />
          {hasFilters && (
            <Button
              onClick={() => {
                setFilterOrg('')
                setFilterProject('')
                setPeriod(EMPTY_PERIOD)
              }}
            >
              Сбросить
            </Button>
          )}
        </Stack>
      </Paper>

      <Paper>
        {memos.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            {hasFilters ? 'По заданному отбору ничего не найдено' : 'Записок пока нет'}
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
              {memos.map((memo) => (
                <TableRow key={memo.id} hover>
                  <TableCell>{memo.number}</TableCell>
                  <TableCell>
                    {memo.process ? (
                      <Link component={RouterLink} to={`/process/${memo.process.id}`}>
                        {memo.subject}
                      </Link>
                    ) : isMine(memo) ? (
                      memo.subject
                    ) : (
                      <Link
                        component="button"
                        onClick={() => { setEditing(memo); setError('') }}
                      >
                        {memo.subject}
                      </Link>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>{memo.author_name ?? '—'}</TableCell>
                  )}
                  <TableCell>{formatDate(memo.date)}</TableCell>
                  <TableCell>{memo.project_name ?? '—'}</TableCell>
                  <TableCell>
                    {memo.process ? (
                      <ProcessStatusBadge status={memo.process.status} />
                    ) : (
                      <Chip label="Черновик" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      {isMine(memo) && isEditable(memo) && (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => submitForApproval(memo)}
                          >
                            {memo.process ? 'Отправить повторно' : 'На согласование'}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => { setEditing(memo); setError('') }}
                          >
                            Изменить
                          </Button>
                        </>
                      )}
                      {isMine(memo) && !memo.process && (
                        <Button size="small" variant="outlined" onClick={() => remove(memo)}>
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
            ? 'Новая служебная записка'
            : readOnly
              ? `${editing.number} — ${editing.author_name ?? 'другой автор'}`
              : `Служебная записка ${editing.number}`}
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
              {organizations.map((org) => (
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
            minRows={5}
            value={editing?.body ?? ''}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            disabled={readOnly}
          />
          {!readOnly && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Маршрут согласования
              </Typography>
              <RoutePreview
                objectType="MEMO"
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
