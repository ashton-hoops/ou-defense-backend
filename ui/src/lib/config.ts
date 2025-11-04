export type AppConfig = {
  apiBaseUrl: string
  mediaServerUrl: string
  environmentName: string
}

const readEnv = (key: 'VITE_API_BASE' | 'VITE_MEDIA_SERVER' | 'VITE_ENV_NAME', fallback?: string): string => {
  const value = import.meta.env[key]
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  if (fallback !== undefined) {
    return fallback
  }
  console.warn(`Missing environment variable: ${key}`)
  return ''
}

export const appConfig: AppConfig = {
  apiBaseUrl: readEnv('VITE_API_BASE', 'http://127.0.0.1:8000'),
  mediaServerUrl: readEnv('VITE_MEDIA_SERVER', 'http://127.0.0.1:8000'),
  environmentName: readEnv('VITE_ENV_NAME', import.meta.env.MODE ?? 'development'),
}

export const getConfig = (): AppConfig => ({ ...appConfig })
