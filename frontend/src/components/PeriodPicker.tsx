import { useState } from 'react'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { ruRU } from '@mui/x-date-pickers/locales'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import 'dayjs/locale/ru'

export interface Period {
  from: string | null // ISO yyyy-mm-dd
  to: string | null
}

export const EMPTY_PERIOD: Period = { from: null, to: null }

function formatDate(iso: string): string {
  return dayjs(iso).format('DD.MM.YYYY')
}

export function periodLabel(period: Period, t: TFunction): string {
  if (!period.from && !period.to) return t('period.allTime')
  if (period.from && period.to) {
    return `${formatDate(period.from)} — ${formatDate(period.to)}`
  }
  if (period.from) return `${t('period.fromShort')} ${formatDate(period.from)}`
  return `${t('period.toShort')} ${formatDate(period.to as string)}`
}

interface Preset {
  key: string
  make: () => Period
}

const iso = (d: Dayjs) => d.format('YYYY-MM-DD')

const PRESETS: Preset[] = [
  { key: 'period.today', make: () => ({ from: iso(dayjs()), to: iso(dayjs()) }) },
  {
    key: 'period.thisWeek',
    make: () => {
      const start = dayjs().subtract((dayjs().day() + 6) % 7, 'day')
      return { from: iso(start), to: iso(start.add(6, 'day')) }
    },
  },
  {
    key: 'period.thisMonth',
    make: () => ({
      from: iso(dayjs().startOf('month')),
      to: iso(dayjs().endOf('month')),
    }),
  },
  {
    key: 'period.thisQuarter',
    make: () => {
      const start = dayjs().month(Math.floor(dayjs().month() / 3) * 3).startOf('month')
      return { from: iso(start), to: iso(start.add(2, 'month').endOf('month')) }
    },
  },
  {
    key: 'period.thisYear',
    make: () => ({
      from: iso(dayjs().startOf('year')),
      to: iso(dayjs().endOf('year')),
    }),
  },
  {
    key: 'period.lastMonth',
    make: () => {
      const start = dayjs().subtract(1, 'month').startOf('month')
      return { from: iso(start), to: iso(start.endOf('month')) }
    },
  },
  {
    key: 'period.lastYear',
    make: () => {
      const start = dayjs().subtract(1, 'year').startOf('year')
      return { from: iso(start), to: iso(start.endOf('year')) }
    },
  },
  { key: 'period.allTime', make: () => EMPTY_PERIOD },
]

/** Выбор периода в стиле 1С: поле с кнопкой, окно с быстрыми периодами
 * и двумя календарями (начало/конец). */
export function PeriodPicker({
  value,
  onChange,
  width = 250,
}: {
  value: Period
  onChange: (period: Period) => void
  width?: number | string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Period>(value)

  const openDialog = () => {
    setDraft(value)
    setOpen(true)
  }

  const apply = () => {
    // защита от «с > по»
    if (draft.from && draft.to && draft.from > draft.to) {
      onChange({ from: draft.to, to: draft.from })
    } else {
      onChange(draft)
    }
    setOpen(false)
  }

  return (
    <>
      <TextField
        label={t('doc.period')}
        value={periodLabel(value, t)}
        onClick={openDialog}
        sx={{ width }}
        slotProps={{
          input: {
            readOnly: true,
            sx: { cursor: 'pointer' },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={openDialog}>
                  <CalendarMonthIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md">
        <DialogTitle>{t('period.title')}</DialogTitle>
        <DialogContent>
          <LocalizationProvider
            dateAdapter={AdapterDayjs}
            adapterLocale="ru"
            localeText={ruRU.components.MuiLocalizationProvider.defaultProps.localeText}
          >
            <Stack direction="row" spacing={2}>
              <List dense sx={{ width: 170, flexShrink: 0 }}>
                {PRESETS.map((preset) => (
                  <ListItemButton
                    key={preset.key}
                    onClick={() => setDraft(preset.make())}
                  >
                    <ListItemText primary={t(preset.key)} />
                  </ListItemButton>
                ))}
              </List>
              <Divider orientation="vertical" flexItem />
              <div>
                <Typography variant="subtitle2" sx={{ textAlign: 'center' }}>
                  {t('period.start')}
                </Typography>
                <DateCalendar
                  value={draft.from ? dayjs(draft.from) : null}
                  onChange={(d) => d && setDraft({ ...draft, from: iso(d) })}
                />
              </div>
              <Divider orientation="vertical" flexItem />
              <div>
                <Typography variant="subtitle2" sx={{ textAlign: 'center' }}>
                  {t('period.end')}
                </Typography>
                <DateCalendar
                  value={draft.to ? dayjs(draft.to) : null}
                  onChange={(d) => d && setDraft({ ...draft, to: iso(d) })}
                />
              </div>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('period.selected')}: {periodLabel(draft, t)}
            </Typography>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(EMPTY_PERIOD)}>{t('period.clear')}</Button>
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={apply}>
            {t('period.apply')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
