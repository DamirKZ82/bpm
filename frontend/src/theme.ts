import { createTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import { ruRU } from '@mui/material/locale'

// «Бумажная» тема: карточки цвета старой газеты на белом фоне (светлая),
// либо тёплые тёмные тона состаренной бумаги (тёмная). Акцент — мягкий
// оранжевый в тон золотому знаку логотипа AL-BINA.

export type ThemeMode = 'light' | 'dark'

const LIGHT = {
  page: '#f4eee0',        // фон — старая газета
  paper: '#ffffff',       // карточки — белый лист
  paperSoft: '#efe7d3',   // сайдбар / вложенные блоки
  input: '#fdfaf3',
  border: '#e2d8c2',
  text: '#3d3627',
  muted: '#8a7d64',
  primaryLight: '#f6e7cd',
}

const DARK = {
  page: '#161310',        // тёмный тёплый фон страницы
  paper: '#211d17',       // состаренная тёмная бумага — карточки
  paperSoft: '#2a251d',   // сайдбар / вложенные блоки
  input: '#2a251d',
  border: '#3a3327',
  text: '#ece3d0',        // кремовый текст
  muted: '#a99e86',
  primaryLight: '#4a3c26',
}

export function buildTheme(mode: ThemeMode): Theme {
  const c = mode === 'dark' ? DARK : LIGHT
  return createTheme(
    {
      shape: { borderRadius: 10 },
      palette: {
        mode,
        primary: {
          main: '#e0a25d',
          light: c.primaryLight,
          dark: '#c07f3c',
          contrastText: '#ffffff',
        },
        secondary: { main: '#a08fc9' },
        success: { main: '#6fae7f' },
        error: { main: '#cc7a7a' },
        warning: { main: '#d9a76a' },
        info: { main: '#7aa7cc' },
        background: { default: c.page, paper: c.paper },
        text: { primary: c.text, secondary: c.muted },
        divider: c.border,
      },
      typography: {
        fontFamily: "'Segoe UI', Roboto, system-ui, -apple-system, sans-serif",
        fontSize: 13.5,
      },
      components: {
        MuiPaper: {
          defaultProps: { variant: 'outlined' },
          styleOverrides: { root: { borderRadius: 16, borderColor: c.border } },
        },
        MuiDialog: { styleOverrides: { paper: { borderRadius: 18 } } },
        MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
        MuiOutlinedInput: {
          styleOverrides: { root: { borderRadius: 10, backgroundColor: c.input } },
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: { root: { textTransform: 'none', borderRadius: 10 } },
        },
        MuiTableCell: { styleOverrides: { root: { borderColor: c.border } } },
      },
    },
    ruRU,
  )
}

/** Оттенки текущего режима для точечного использования в компонентах. */
export function surfacesFor(mode: ThemeMode) {
  return mode === 'dark' ? DARK : LIGHT
}
