import { Component } from 'react'
import type { ReactNode } from 'react'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { reportClientError } from '../errorReporting'

interface State {
  hasError: boolean
  errorCode: string | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, errorCode: null }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    reportClientError(error.message, error.stack).then((result) => {
      if (result) this.setState({ errorCode: result.error_code })
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <Stack
        sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}
      >
        <Paper sx={{ p: 4, maxWidth: 440, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
            Что-то пошло не так
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Произошла ошибка интерфейса. Она уже записана в журнал.
            {this.state.errorCode && (
              <>
                {' '}Код инцидента: <b>{this.state.errorCode}</b>
              </>
            )}
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Перезагрузить страницу
          </Button>
        </Paper>
      </Stack>
    )
  }
}
