import type { SxProps, Theme } from '@mui/material/styles'

/** Закреплённая нижняя панель диалога (кнопки всегда видны при длинной
 * форме): липкая к низу, с фоном, разделителем и лёгкой тенью. */
export const STICKY_ACTIONS: SxProps<Theme> = {
  position: 'sticky',
  bottom: 0,
  bgcolor: 'background.paper',
  borderTop: '1px solid',
  borderColor: 'divider',
  boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
  px: 3,
  py: 1.5,
  zIndex: 1,
}
