/**
 * Typed fetch wrapper for talking to Frends API triggers.
 *
 * Every request is root-relative to `/api` — never a hostname. In development the
 * Vite proxy forwards `/api` to your Frends Agent; in production the bundle is
 * served from the same Agent, so `/api` is already same-origin. No CORS, no axios.
 */
const API_BASE = '/api'

/** Thrown on any non-2xx response, carrying the parsed response body. */
export class ApiFetchError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`Request failed with status ${status}`)
    this.name = 'ApiFetchError'
    this.status = status
    this.body = body
  }
}

/** Conventional 4xx error body returned by Frends submission Processes. */
export interface ApiErrorBody {
  /** Form-level message to show the user. */
  message?: string
  /** Field-level errors keyed by form field name. */
  errors?: Record<string, string>
}

/** Narrow an unknown `ApiFetchError` body to the conventional error shape. */
export function asApiErrorBody(body: unknown): ApiErrorBody {
  return body && typeof body === 'object' ? (body as ApiErrorBody) : {}
}

/**
 * Fetch `${'/api'}${path}` as JSON.
 * - Sets `Content-Type: application/json`.
 * - Returns the parsed JSON body typed as `T`.
 * - Throws `ApiFetchError` (with the parsed body) on any non-2xx response.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  // Parse the body once. Tolerate empty bodies (e.g. 204) and non-JSON error
  // bodies (e.g. a gateway/proxy 502) — fall back to the raw text so the real
  // status is never masked by a JSON parse error.
  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!response.ok) {
    throw new ApiFetchError(response.status, body)
  }
  return body as T
}
