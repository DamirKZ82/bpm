import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

/** Адаптивная сетка «подпись-значение»: от 1 до 4 колонок по ширине
 * контейнера (minmax с нижним порогом 25% ограничивает четырьмя). */
export function InfoGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns:
          'repeat(auto-fill, minmax(max(230px, calc(25% - 16px)), 1fr))',
      }}
    >
      {children}
    </Box>
  )
}

export function InfoCell({
  label,
  value,
  span = false,
}: {
  label: string
  value: ReactNode
  span?: boolean
}) {
  return (
    <Box sx={span ? { gridColumn: '1 / -1' } : undefined}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 0.25 }}
      >
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  )
}
