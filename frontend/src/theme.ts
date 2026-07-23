import { createTheme } from '@mui/material/styles'
import { ruRU } from '@mui/material/locale'

// «Бумажная» тема: карточки цвета старой газеты (кремовый) на белом фоне,
// мягкие скругления, тёплые тона текста и границ. Акцент — мягкий оранжевый
// в тон золотому знаку логотипа AL-BINA.
const PAPER = '#f7f2e6'       // старая газета — фон карточек
const PAPER_SOFT = '#f1e9d6'  // чуть глубже — сайдбар и вложенные блоки
const PAGE = '#ffffff'        // белый фон страницы
const BORDER = '#e7dec9'      // тёплая граница
const TEXT = '#3d3627'        // тёплый тёмно-коричневый
const TEXT_MUTED = '#8a7d64'

export const theme = createTheme(
  {
    shape: { borderRadius: 10 },
    palette: {
      primary: {
        main: '#e0a25d',
        light: '#efdbb8',   // видимая подсветка на кремовом
        dark: '#c07f3c',
        contrastText: '#ffffff',
      },
      secondary: { main: '#a08fc9' },
      success: { main: '#6fae7f' },
      error: { main: '#cc7a7a' },
      warning: { main: '#d9a76a' },
      info: { main: '#7aa7cc' },
      background: { default: PAGE, paper: PAPER },
      text: { primary: TEXT, secondary: TEXT_MUTED },
      divider: BORDER,
    },
    typography: {
      fontFamily: "'Segoe UI', Roboto, system-ui, -apple-system, sans-serif",
      fontSize: 13.5,
    },
    components: {
      MuiPaper: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: { borderRadius: 16, borderColor: BORDER },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 18 } },
      },
      MuiTextField: {
        defaultProps: { size: 'small', fullWidth: true },
      },
      MuiOutlinedInput: {
        // белые поля на кремовой «бумаге» — как формы на листе
        styleOverrides: {
          root: { borderRadius: 10, backgroundColor: '#fffdf8' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { textTransform: 'none', borderRadius: 10 } },
      },
      MuiTableCell: {
        styleOverrides: { root: { borderColor: BORDER } },
      },
    },
  },
  ruRU,
)

// экспортируем оттенки для точечного использования в компонентах
export const surfaces = { PAPER, PAPER_SOFT, PAGE, BORDER }
