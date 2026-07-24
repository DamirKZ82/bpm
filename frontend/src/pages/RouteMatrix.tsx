import { useCallback, useEffect, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api/client'
import type { DocumentTypeRef, OrganizationRef, ProjectRef } from '../api/types'

const RESOLVER_TYPES = [
  { value: 'POSITION_IN_ORG', label: 'Должность в организации' },
  { value: 'POSITION_IN_PROJECT', label: 'Должность в проекте' },
  { value: 'INITIATOR', label: 'Инициатор' },
  { value: 'INITIATOR_MANAGER', label: 'Руководитель инициатора' },
  { value: 'PROJECT_MANAGER', label: 'Руководитель проекта' },
]

const STAGE_TYPES = [
  { value: 'SEQUENTIAL', label: 'Последовательно' },
  { value: 'PARALLEL_ALL', label: 'Параллельно — все' },
  { value: 'PARALLEL_ANY', label: 'Параллельно — любой' },
  { value: 'QUORUM', label: 'Кворум N из M' },
]

const TASK_KINDS = [
  { value: 'APPROVAL', label: 'Согласование' },
  { value: 'EXECUTION', label: 'Исполнение' },
  { value: 'ACKNOWLEDGEMENT', label: 'Ознакомление' },
]

const MANDATORY = [
  { value: 'REQUIRED', label: 'Обязательно' },
  { value: 'OPTIONAL', label: 'Опционально' },
  { value: 'SKIP_IF_NO_ASSIGNEE', label: 'Пропустить, если нет исполнителя' },
]

const CONDITION_OPS = [
  { value: 'gt', label: '>' },
  { value: 'ge', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'le', label: '≤' },
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
]

// поля, по которым можно строить условие (числовые/строковые/булевы)
const CONDITION_FIELD_TYPES = new Set(['NUMBER', 'MONEY', 'STRING', 'BOOLEAN'])

const label = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value

interface Participant {
  resolver_type: string
  task_kind: string
  position_id: string | null
  deadline_hours: number | null
  mandatory: string
}

interface StageCondition {
  field: string
  op: string
  value: string | number
}

interface Stage {
  stage_type: string
  quorum_count: number | null
  condition?: StageCondition | null
  participants: Participant[]
}

interface Route {
  object_type: string
  organization_id: string | null
  project_id: string | null
  priority: number
  valid_from: string | null
  valid_to: string | null
  stages: Stage[]
}

interface PositionRef {
  id: string
  name: string
}

const emptyParticipant = (): Participant => ({
  resolver_type: 'POSITION_IN_ORG',
  task_kind: 'APPROVAL',
  position_id: null,
  deadline_hours: 24,
  mandatory: 'REQUIRED',
})

const emptyStage = (): Stage => ({
  stage_type: 'SEQUENTIAL',
  quorum_count: null,
  condition: null,
  participants: [emptyParticipant()],
})

const contextOf = (route: Route) => ({
  object_type: route.object_type,
  organization_id: route.organization_id,
  project_id: route.project_id,
})

export function RouteMatrixPage() {
  const [routes, setRoutes] = useState<Route[] | null>(null)
  const [docTypes, setDocTypes] = useState<DocumentTypeRef[]>([])
  const [positions, setPositions] = useState<PositionRef[]>([])
  const [organizations, setOrganizations] = useState<OrganizationRef[]>([])
  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [editing, setEditing] = useState<Route | null>(null)
  const [original, setOriginal] = useState<ReturnType<typeof contextOf> | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    api<Route[]>('/api/admin/route-matrix').then(setRoutes)
  }, [])

  useEffect(() => {
    reload()
    api<DocumentTypeRef[]>('/api/refs/document-types').then(setDocTypes)
    api<PositionRef[]>('/api/refs/positions').then(setPositions)
    api<OrganizationRef[]>('/api/refs/organizations').then(setOrganizations)
    api<ProjectRef[]>('/api/refs/projects').then(setProjects)
  }, [reload])

  const OBJECT_TYPES = docTypes.map((t) => ({ value: t.code, label: t.name }))

  const positionName = (id: string | null) =>
    positions.find((p) => p.id === id)?.name ?? '?'

  // поля выбранного вида документа, пригодные для условия
  const conditionFields = (typeCode: string) =>
    (docTypes.find((t) => t.code === typeCode)?.fields ?? []).filter((f) =>
      CONDITION_FIELD_TYPES.has(f.field_type),
    )

  const conditionLabel = (typeCode: string, c: StageCondition) => {
    const fieldName =
      conditionFields(typeCode).find((f) => f.code === c.field)?.name ?? c.field
    const op = CONDITION_OPS.find((o) => o.value === c.op)?.label ?? c.op
    return `если ${fieldName} ${op} ${c.value}`
  }

  const setCondition = (stageIndex: number, next: Partial<StageCondition> | null) => {
    if (!editing) return
    const stage = editing.stages[stageIndex]
    if (next === null) {
      patchStage(stageIndex, { condition: null })
      return
    }
    const base: StageCondition = stage.condition ?? { field: '', op: 'gt', value: '' }
    patchStage(stageIndex, { condition: { ...base, ...next } })
  }

  const participantLabel = (p: Participant) => {
    const base = p.resolver_type.startsWith('POSITION')
      ? positionName(p.position_id)
      : label(RESOLVER_TYPES, p.resolver_type)
    const kind = p.task_kind && p.task_kind !== 'APPROVAL'
      ? ` [${label(TASK_KINDS, p.task_kind)}]`
      : ''
    return `${base}${kind}${p.deadline_hours ? ` · ${p.deadline_hours}ч` : ''}`
  }

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      await api('/api/admin/route-matrix', {
        method: 'POST',
        body: { ...editing, original },
      })
      setEditing(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (route: Route) => {
    if (!confirm('Удалить маршрут целиком?')) return
    setListError('')
    try {
      await api('/api/admin/route-matrix/delete', {
        method: 'POST',
        body: contextOf(route),
      })
      reload()
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Ошибка удаления')
    }
  }

  const patchStage = (index: number, patch: Partial<Stage>) => {
    if (!editing) return
    const stages = editing.stages.map((s, i) => (i === index ? { ...s, ...patch } : s))
    setEditing({ ...editing, stages })
  }

  const patchParticipant = (
    stageIndex: number,
    participantIndex: number,
    patch: Partial<Participant>,
  ) => {
    if (!editing) return
    const stages = editing.stages.map((stage, si) =>
      si === stageIndex
        ? {
            ...stage,
            participants: stage.participants.map((p, pi) =>
              pi === participantIndex ? { ...p, ...patch } : p,
            ),
          }
        : stage,
    )
    setEditing({ ...editing, stages })
  }

  if (routes === null) return null

  return (
    <>
      <Stack
        direction="row"
        sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Матрица согласования
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Один маршрут — вид объекта в разрезе организации и проекта
            (пусто = любая). При конфликте побеждает меньший приоритет.
            Изменения не влияют на запущенные процессы.
          </Typography>
        </div>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<HelpOutlineIcon />}
            onClick={() => window.open('/help/route-matrix.html', '_blank', 'noopener')}
          >
            Инструкция
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditing({
                object_type: 'MEMO',
                organization_id: null,
                project_id: null,
                priority: 100,
                valid_from: null,
                valid_to: null,
                stages: [emptyStage()],
              })
              setOriginal(null)
              setError('')
            }}
          >
            Новый маршрут
          </Button>
        </Stack>
      </Stack>
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

      {routes.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Маршрутов пока нет — создайте первый
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {routes.map((route, index) => (
            <Paper key={index} sx={{ p: 2.5 }}>
              <Stack
                direction="row"
                sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}
              >
                <div>
                  <Typography variant="h6">
                    {label(OBJECT_TYPES, route.object_type)}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        route.organization_id
                          ? organizations.find((o) => o.id === route.organization_id)?.name
                          : 'Любая организация'
                      }
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        route.project_id
                          ? projects.find((p) => p.id === route.project_id)?.name
                          : 'Любой проект'
                      }
                    />
                    <Chip size="small" variant="outlined" label={`Приоритет ${route.priority}`} />
                    {(route.valid_from || route.valid_to) && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="warning"
                        label={`${route.valid_from ?? '…'} — ${route.valid_to ?? '…'}`}
                      />
                    )}
                  </Stack>
                </div>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setEditing(JSON.parse(JSON.stringify(route)))
                      setOriginal(contextOf(route))
                      setError('')
                    }}
                  >
                    Изменить
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => remove(route)}>
                    Удалить
                  </Button>
                </Stack>
              </Stack>
              {route.stages.map((stage, stageIndex) => (
                <Stack
                  key={stageIndex}
                  direction="row"
                  spacing={1}
                  sx={{ py: 0.5, alignItems: 'baseline', flexWrap: 'wrap' }}
                >
                  <Typography sx={{ fontWeight: 600, width: 70, flexShrink: 0 }}>
                    Этап {stageIndex + 1}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ width: 175, flexShrink: 0 }}>
                    {label(STAGE_TYPES, stage.stage_type)}
                    {stage.stage_type === 'QUORUM' && ` (${stage.quorum_count})`}
                  </Typography>
                  <Typography variant="body2">
                    {stage.participants.map(participantLabel).join('; ')}
                    {stage.condition?.field && (
                      <Typography component="span" variant="body2" color="warning.main">
                        {' '}· {conditionLabel(route.object_type, stage.condition)}
                      </Typography>
                    )}
                  </Typography>
                </Stack>
              ))}
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>
          {original ? 'Маршрут согласования' : 'Новый маршрут согласования'}
        </DialogTitle>
        <DialogContent>
          {editing && (
            <>
              {/* контекст маршрута */}
              <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 2 }}>
                <TextField
                  select
                  label="Вид объекта"
                  value={editing.object_type}
                  onChange={(e) => setEditing({ ...editing, object_type: e.target.value })}
                >
                  {OBJECT_TYPES.map((o) => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Организация"
                  value={editing.organization_id ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, organization_id: e.target.value || null })
                  }
                >
                  <MenuItem value="">Любая</MenuItem>
                  {organizations.map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Проект"
                  value={editing.project_id ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, project_id: e.target.value || null })
                  }
                >
                  <MenuItem value="">Любой</MenuItem>
                  {projects.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Приоритет"
                  type="number"
                  sx={{ width: 130, flexShrink: 0 }}
                  value={editing.priority}
                  onChange={(e) =>
                    setEditing({ ...editing, priority: Number(e.target.value) })
                  }
                />
              </Stack>
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <TextField
                  label="Действует с"
                  type="date"
                  value={editing.valid_from ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, valid_from: e.target.value || null })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="Действует по"
                  type="date"
                  value={editing.valid_to ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, valid_to: e.target.value || null })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>

              {/* этапы */}
              {editing.stages.map((stage, stageIndex) => (
                <Paper
                  key={stageIndex}
                  sx={{
                    p: 2, mb: 2,
                    bgcolor: (t) => (t.palette.mode === 'dark' ? '#2a251d' : '#f6f0e2'),
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ mb: 1.5, alignItems: 'center' }}
                  >
                    <Typography sx={{ fontWeight: 700, width: 70, flexShrink: 0 }}>
                      Этап {stageIndex + 1}
                    </Typography>
                    <TextField
                      select
                      label="Тип этапа"
                      size="small"
                      sx={{ width: 220 }}
                      value={stage.stage_type}
                      onChange={(e) =>
                        patchStage(stageIndex, {
                          stage_type: e.target.value,
                          quorum_count:
                            e.target.value === 'QUORUM' ? stage.quorum_count ?? 2 : null,
                        })
                      }
                    >
                      {STAGE_TYPES.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                    {stage.stage_type === 'QUORUM' && (
                      <TextField
                        label="Кворум"
                        type="number"
                        size="small"
                        sx={{ width: 110 }}
                        value={stage.quorum_count ?? ''}
                        onChange={(e) =>
                          patchStage(stageIndex, { quorum_count: Number(e.target.value) })
                        }
                      />
                    )}
                    <div style={{ flexGrow: 1 }} />
                    <Tooltip title="Удалить этап">
                      <span>
                        <IconButton
                          size="small"
                          disabled={editing.stages.length === 1}
                          onClick={() =>
                            setEditing({
                              ...editing,
                              stages: editing.stages.filter((_, i) => i !== stageIndex),
                            })
                          }
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>

                  {/* условие включения этапа (по полю документа) */}
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{ mb: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ width: 70, flexShrink: 0 }}
                    >
                      Условие
                    </Typography>
                    <TextField
                      select
                      label="Поле"
                      size="small"
                      sx={{ width: 200, flexShrink: 0 }}
                      value={stage.condition?.field ?? ''}
                      onChange={(e) =>
                        setCondition(
                          stageIndex,
                          e.target.value ? { field: e.target.value } : null,
                        )
                      }
                    >
                      <MenuItem value="">— всегда включён —</MenuItem>
                      {conditionFields(editing.object_type).map((f) => (
                        <MenuItem key={f.code} value={f.code}>{f.name}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Оператор"
                      size="small"
                      sx={{ width: 120, flexShrink: 0 }}
                      disabled={!stage.condition?.field}
                      value={stage.condition?.op ?? 'gt'}
                      onChange={(e) => setCondition(stageIndex, { op: e.target.value })}
                    >
                      {CONDITION_OPS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="Значение"
                      size="small"
                      sx={{ width: 160, flexShrink: 0 }}
                      disabled={!stage.condition?.field}
                      value={stage.condition?.value ?? ''}
                      onChange={(e) => setCondition(stageIndex, { value: e.target.value })}
                    />
                    {stage.condition?.field && (
                      <Typography variant="caption" color="text.secondary">
                        этап включается только при истинном условии
                      </Typography>
                    )}
                  </Stack>

                  {stage.participants.map((participant, participantIndex) => (
                    <Stack
                      key={participantIndex}
                      direction="row"
                      spacing={1.5}
                      sx={{ mb: 1, alignItems: 'center' }}
                    >
                      <TextField
                        select
                        label="Вид задания"
                        size="small"
                        sx={{ width: 190, flexShrink: 0 }}
                        value={participant.task_kind}
                        onChange={(e) =>
                          patchParticipant(stageIndex, participantIndex, {
                            task_kind: e.target.value,
                          })
                        }
                      >
                        {TASK_KINDS.map((o) => (
                          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label="Адресация"
                        size="small"
                        sx={{ width: 240, flexShrink: 0 }}
                        value={participant.resolver_type}
                        onChange={(e) =>
                          patchParticipant(stageIndex, participantIndex, {
                            resolver_type: e.target.value,
                            position_id: e.target.value.startsWith('POSITION')
                              ? participant.position_id
                              : null,
                          })
                        }
                      >
                        {RESOLVER_TYPES.map((o) => (
                          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label="Должность"
                        size="small"
                        disabled={!participant.resolver_type.startsWith('POSITION')}
                        value={participant.position_id ?? ''}
                        onChange={(e) =>
                          patchParticipant(stageIndex, participantIndex, {
                            position_id: e.target.value || null,
                          })
                        }
                      >
                        {positions.map((p) => (
                          <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Срок, ч"
                        type="number"
                        size="small"
                        sx={{ width: 100, flexShrink: 0 }}
                        value={participant.deadline_hours ?? ''}
                        onChange={(e) =>
                          patchParticipant(stageIndex, participantIndex, {
                            deadline_hours: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                      <TextField
                        select
                        label="Обязательность"
                        size="small"
                        sx={{ width: 260, flexShrink: 0 }}
                        value={participant.mandatory}
                        onChange={(e) =>
                          patchParticipant(stageIndex, participantIndex, {
                            mandatory: e.target.value,
                          })
                        }
                      >
                        {MANDATORY.map((o) => (
                          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                        ))}
                      </TextField>
                      <Tooltip title="Удалить участника">
                        <span>
                          <IconButton
                            size="small"
                            disabled={stage.participants.length === 1}
                            onClick={() =>
                              patchStage(stageIndex, {
                                participants: stage.participants.filter(
                                  (_, i) => i !== participantIndex,
                                ),
                              })
                            }
                          >
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  ))}
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() =>
                      patchStage(stageIndex, {
                        participants: [...stage.participants, emptyParticipant()],
                      })
                    }
                  >
                    Участник
                  </Button>
                </Paper>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={() =>
                  setEditing({ ...editing, stages: [...editing.stages, emptyStage()] })
                }
              >
                Добавить этап
              </Button>
              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Отмена</Button>
          <Button variant="contained" onClick={save} disabled={busy}>
            Сохранить маршрут
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
