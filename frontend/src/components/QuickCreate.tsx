import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import FlightTakeoffOutlinedIcon from '@mui/icons-material/FlightTakeoffOutlined'
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined'
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { SvgIconComponent } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useLocalizeName } from '../i18n/localize'

interface FrequentType {
  code: string
  name: string
  name_i18n?: Record<string, string> | null
  count: number
}

// набор иконок; вид документа получает стабильную иконку по своему коду
const ICONS: SvgIconComponent[] = [
  BadgeOutlinedIcon,
  ReceiptLongOutlinedIcon,
  HandshakeOutlinedIcon,
  DirectionsCarOutlinedIcon,
  InventoryOutlinedIcon,
  BuildOutlinedIcon,
  FlightTakeoffOutlinedIcon,
]

function iconFor(code: string): SvgIconComponent {
  if (code === 'MEMO') return DescriptionOutlinedIcon
  let hash = 0
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) % 9973
  return ICONS[hash % ICONS.length]
}

/** Быстрый запуск: создание самых частых видов документов в один клик. */
export function QuickCreate({ canCreate }: { canCreate: boolean }) {
  const { t } = useTranslation()
  const localizeName = useLocalizeName()
  const navigate = useNavigate()
  const [types, setTypes] = useState<FrequentType[]>([])

  useEffect(() => {
    api<FrequentType[]>('/api/my/frequent-types?limit=4')
      .then(setTypes)
      .catch(() => setTypes([]))
  }, [])

  if (types.length === 0) return null

  return (
    <Paper sx={{ p: 2.5, mt: 2 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        {t('dashboard.quickCreate')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns:
            'repeat(auto-fill, minmax(max(200px, calc(25% - 16px)), 1fr))',
        }}
      >
        {types.map((type) => {
          const Icon = iconFor(type.code)
          return (
            <ButtonBase
              key={type.code}
              disabled={!canCreate}
              onClick={() => navigate(`/documents/${type.code}?new=1`)}
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                justifyContent: 'flex-start',
                textAlign: 'left',
                opacity: canCreate ? 1 : 0.5,
                transition: 'border-color .15s, background-color .15s',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'primary.light',
                },
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', width: '100%' }}>
                <Box
                  sx={{
                    width: 42, height: 42, borderRadius: 2,
                    bgcolor: 'primary.light',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon sx={{ color: 'primary.dark' }} />
                </Box>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {localizeName(type.name, type.name_i18n)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('dashboard.createNew')}
                  </Typography>
                </Box>
                <AddIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </Stack>
            </ButtonBase>
          )
        })}
      </Box>
    </Paper>
  )
}
