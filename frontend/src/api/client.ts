export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let token: string | null = localStorage.getItem('bpm_token')

export function setToken(value: string | null) {
  token = value
  if (value) localStorage.setItem('bpm_token', value)
  else localStorage.removeItem('bpm_token')
}

export function hasToken(): boolean {
  return token !== null
}

interface RequestOptions {
  method?: string
  body?: unknown
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: {
      // для FormData Content-Type ставит браузер (с boundary)
      ...(opts.body !== undefined && !isForm
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body:
      opts.body === undefined
        ? undefined
        : isForm
          ? (opts.body as FormData)
          : JSON.stringify(opts.body),
  })
  if (res.status === 401) {
    setToken(null)
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new ApiError(401, 'Не авторизован')
  }
  if (!res.ok) {
    let detail: unknown = res.statusText
    try {
      const data = await res.json()
      detail = data.detail ?? detail
    } catch {
      /* тело не JSON */
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Скачивание файла с авторизацией: получаем blob и отдаём браузеру. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new ApiError(res.status, 'Не удалось скачать файл')
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
