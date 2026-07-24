import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchIcon from '@mui/icons-material/Search'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { DocumentItem } from '../api/types'

/** Поиск по всем документам (номер, тема) с переходом к документу. */
export function GlobalSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(false)

  // запрос с задержкой, чтобы не дёргать сервер на каждый символ
  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setOptions([])
      return
    }
    setLoading(true)
    const timer = window.setTimeout(() => {
      api<DocumentItem[]>(
        `/api/documents?search=${encodeURIComponent(text)}&limit=10`,
      )
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const noOptionsText = useMemo(
    () => (query.trim().length < 2 ? t('search.hint') : t('search.noResults')),
    [query, t],
  )

  return (
    <Autocomplete<DocumentItem, false, false, true>
      freeSolo
      size="small"
      sx={{ width: { xs: 220, sm: 340 } }}
      options={options}
      loading={loading}
      filterOptions={(x) => x}   // фильтрует сервер
      noOptionsText={noOptionsText}
      getOptionLabel={(option) =>
        typeof option === 'string' ? option : `${option.number} ${option.subject}`
      }
      onInputChange={(_, value) => setQuery(value)}
      onChange={(_, value) => {
        if (!value || typeof value === 'string') return
        navigate(
          value.process ? `/process/${value.process.id}` : `/documents/${value.type_code}`,
        )
        setQuery('')
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id}>
          <Box>
            <Typography variant="body2">{option.subject}</Typography>
            <Typography variant="caption" color="text.secondary">
              {option.number}
              {option.project_name ? ` · ${option.project_name}` : ''}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={t('search.placeholder')}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  )
}
