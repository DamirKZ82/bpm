import { createTheme } from '@mui/material/styles'
import { ruRU } from '@mui/material/locale'

// Светлая пастельная палитра: мягкие приглушённые тона,
// но с достаточным контрастом для читаемости
export const theme = createTheme(
  {
    palette: {
      // мягкий оранжевый в тон золотому знаку логотипа (#EBBB7C)
      primary: {
        main: '#e0a25d',
        light: '#faf0e2',
        dark: '#c07f3c',
        contrastText: '#ffffff',
      },
      secondary: { main: '#a08fc9' },
      success: { main: '#6fae7f' },
      error: { main: '#cc7a7a' },
      warning: { main: '#d9a76a' },
      info: { main: '#7aa7cc' },
      background: { default: '#f6f8fb', paper: '#ffffff' },
      text: { primary: '#3a4356', secondary: '#7b8494' },
      divider: '#e4e9f0',
    },
    typography: {
      fontFamily: "'Segoe UI', Roboto, system-ui, -apple-system, sans-serif",
      fontSize: 13.5,
    },
    components: {
      MuiPaper: {
        defaultProps: { variant: 'outlined' },
      },
      MuiTextField: {
        defaultProps: { size: 'small', fullWidth: true },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { textTransform: 'none' } },
      },
    },
  },
  ruRU,
)
