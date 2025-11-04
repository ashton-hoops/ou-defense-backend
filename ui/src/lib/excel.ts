export type ExcelControllerStatus = {
  ok: boolean
  running?: boolean
  pid?: number
  info?: unknown
  bridge_path?: string
  error?: string
}

export type ExcelWorkbookStatus = {
  ok: boolean
  workbook?: string
  sheet?: string
  error?: string
}

export type ExcelStatus = {
  controller: ExcelControllerStatus | null
  workbook: ExcelWorkbookStatus | null
}

const jsonRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init)
  const text = await response.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (err) {
    throw new Error(`Invalid JSON from ${url}`)
  }
  if (!response.ok || (data && data.ok === false)) {
    const message = data && data.error ? data.error : response.statusText
    throw new Error(message || `Request failed (${response.status})`)
  }
  return data as T
}

export const getExcelStatus = async (): Promise<ExcelStatus> => {
  const data = await jsonRequest<{ ok: boolean; controller?: ExcelControllerStatus; workbook?: ExcelWorkbookStatus }>(
    '/excel/status',
  )
  return {
    controller: data.controller ?? null,
    workbook: data.workbook ?? null,
  }
}

export const startExcelBridge = async (): Promise<void> => {
  await jsonRequest<{ ok: boolean }>('/excel/start', { method: 'POST' })
}

export const stopExcelBridge = async (): Promise<void> => {
  await jsonRequest<{ ok: boolean }>('/excel/stop', { method: 'POST' })
}

export const checkExcelRow = async (row: number): Promise<{ hasData: boolean }> => {
  const data = await jsonRequest<{ ok: boolean; status?: { has_data?: boolean } }>(
    `/excel/check-row?row=${encodeURIComponent(row)}`,
  )
  return { hasData: Boolean(data.status?.has_data) }
}

export const appendExcelRow = async (payload: Record<string, unknown>): Promise<void> => {
  await jsonRequest<{ ok: boolean }>('/excel/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
