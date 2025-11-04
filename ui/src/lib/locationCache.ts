const LOCATION_CACHE_KEY = 'ou_wbb_game_location_map'

type CachedLocation = {
  code?: string
  display?: string
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

let cacheStore: Record<string, CachedLocation> | null = null

const readCache = (): Record<string, CachedLocation> => {
  if (cacheStore) return cacheStore
  if (typeof window === 'undefined' || !window.localStorage) {
    cacheStore = {}
    return cacheStore
  }
  try {
    const raw = window.localStorage.getItem(LOCATION_CACHE_KEY)
    cacheStore = raw ? (JSON.parse(raw) as Record<string, CachedLocation>) : {}
  } catch {
    cacheStore = {}
  }
  return cacheStore
}

const buildCandidateKeys = (gameId?: string | number | null, opponent?: string | null): string[] => {
  const keys: string[] = []
  const id = gameId !== undefined && gameId !== null ? String(gameId).trim() : ''
  const opponentSlug = opponent ? slugify(opponent) : ''

  if (id) {
    keys.push(id, `num:${id}`)
    if (opponentSlug) {
      keys.push(`num:${id}:${opponentSlug}`)
    }
  }

  if (opponentSlug) {
    keys.push(opponentSlug)
  }

  return keys
}

export const resolveCachedGameLocation = (
  gameId?: string | number | null,
  opponent?: string | null,
): CachedLocation | null => {
  const cache = readCache()
  const candidates = buildCandidateKeys(gameId, opponent)
  for (const key of candidates) {
    if (!key) continue
    const entry = cache[key]
    if (entry && (entry.code || entry.display)) {
      return entry
    }
  }
  return null
}
