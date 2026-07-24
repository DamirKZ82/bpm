import Button from '@mui/material/Button'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined'
import { useTranslation } from 'react-i18next'

/** Кнопка вызова справки: анимированный вопросительный знак + «Как это
 * работает?». Открывает HTML-инструкцию в новой вкладке. */
export function HelpButton({ href }: { href: string }) {
  const { t } = useTranslation()
  return (
    <Button
      variant="outlined"
      onClick={() => window.open(href, '_blank', 'noopener')}
      startIcon={
        <HelpOutlineIcon
          sx={{
            color: 'primary.main',
            transformOrigin: '50% 50%',
            animation: 'bpmHelpPulse 1.8s ease-in-out infinite',
            '@keyframes bpmHelpPulse': {
              '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
              '20%': { transform: 'scale(1.25) rotate(-12deg)' },
              '40%': { transform: 'scale(1.25) rotate(12deg)' },
              '60%': { transform: 'scale(1.15) rotate(0deg)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      }
    >
      {t('common.howItWorks')}
    </Button>
  )
}
