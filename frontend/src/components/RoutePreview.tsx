import { useEffect, useState } from 'react'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { api } from '../api/client'
import type { RouteStageSnapshot } from '../api/types'

const STAGE_TYPE_LABEL: Record<string, string> = {
  SEQUENTIAL: 'последовательно',
  PARALLEL_ALL: 'все',
  PARALLEL_ANY: 'любой',
  QUORUM: 'кворум',
}

interface Preview {
  ok: boolean
  error: string | null
  stages: RouteStageSnapshot[]
}

/** Схема маршрута согласования, рассчитанная по матрице до запуска
 * процесса (тестировщик матрицы, ТЗ §4.4). */
export function RoutePreview({
  objectType,
  organizationId,
  projectId,
}: {
  objectType: string
  organizationId: string | null | undefined
  projectId: string | null | undefined
}) {
  const [preview, setPreview] = useState<Preview | null>(null)

  useEffect(() => {
    setPreview(null)
    if (!organizationId || !projectId) return
    const params = new URLSearchParams({
      object_type: objectType,
      organization_id: organizationId,
      project_id: projectId,
    })
    api<Preview>(`/api/route-preview?${params}`)
      .then(setPreview)
      .catch(() => setPreview(null))
  }, [objectType, organizationId, projectId])

  if (!organizationId || !projectId) {
    return (
      <Typography variant="body2" color="text.secondary">
        Выберите организацию и проект — маршрут рассчитается автоматически
      </Typography>
    )
  }
  if (preview === null) return null
  if (!preview.ok) {
    return <Alert severity="warning">{preview.error}</Alert>
  }

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'stretch' }}>
        {preview.stages.map((stage, index) => (
          <Stack
            key={stage.stage_no}
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexShrink: 0 }}
          >
            {index > 0 && <ArrowForwardIcon sx={{ color: 'text.secondary' }} />}
            <Paper
              sx={{
                p: 1.5,
                minWidth: 180,
                bgcolor: '#fafbfd',
                height: '100%',
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ mb: 0.75, alignItems: 'center' }}
              >
                <Typography variant="subtitle2">Этап {stage.stage_no}</Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={
                    stage.stage_type === 'QUORUM'
                      ? `кворум ${stage.quorum_count}`
                      : STAGE_TYPE_LABEL[stage.stage_type] ?? stage.stage_type
                  }
                />
              </Stack>
              {stage.slots.map((slot) =>
                slot.skipped ? (
                  <Typography
                    key={slot.order_in_stage}
                    variant="body2"
                    color="text.secondary"
                  >
                    {slot.position_name ?? slot.resolver_type} — пропущен
                  </Typography>
                ) : (
                  slot.assignees.map((assignee) => (
                    <Box key={assignee.employee_id} sx={{ mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {assignee.full_name}
                        {assignee.substitute_for_id && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                          >
                            {' '}(замещает {assignee.substitute_for_name})
                          </Typography>
                        )}
                      </Typography>
                      {slot.position_name && (
                        <Typography variant="caption" color="text.secondary">
                          {slot.position_name}
                          {slot.deadline_hours ? ` · ${slot.deadline_hours}ч` : ''}
                        </Typography>
                      )}
                    </Box>
                  ))
                ),
              )}
            </Paper>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
