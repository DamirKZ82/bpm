import { api } from './api/client'

let reported = 0
const seen = new Set<string>()

/** Отправка ошибки фронтенда на сервер (не более 10 за сессию, без дублей). */
export function reportClientError(
  message: string,
  stack?: string | null,
): Promise<{ error_code: string } | null> {
  const key = message.slice(0, 200)
  if (reported >= 10 || seen.has(key)) return Promise.resolve(null)
  reported += 1
  seen.add(key)
  return api<{ error_code: string }>('/api/client-errors', {
    method: 'POST',
    body: {
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 20000) ?? null,
      path: window.location.pathname,
    },
  }).catch(() => null)
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError(event.message, event.error?.stack)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    reportClientError(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    )
  })
}
