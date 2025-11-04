import { useEffect, useMemo, useState } from 'react'
import type { DataMode } from '../lib/data'
import { createCloudAdapter, createLocalAdapter } from '../lib/data'
import {
  DASHBOARD_STORAGE_KEY,
  loadCachedClips,
  normalizeClip,
  toClipSummary,
  type ClipSummary,
} from '../lib/data/transformers'

type ConnectionStatus = 'checking' | 'online' | 'offline'

type ReactClipsPanelProps = {
  dataMode: DataMode
  onOpenClip?: (clipId: string, summary: ClipSummary) => void
  refreshKey?: number
}

const statusBadgeStyles: Record<ConnectionStatus, { dot: string; text: string }> = {
  checking: { dot: 'bg-amber-400', text: 'bg-amber-500/20 text-amber-100 border border-amber-400/40' },
  online: { dot: 'bg-emerald-400', text: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/40' },
  offline: { dot: 'bg-rose-400', text: 'bg-rose-500/15 text-rose-200 border border-rose-500/40' },
}

const ReactClipsPanel = ({ dataMode, onOpenClip, refreshKey = 0 }: ReactClipsPanelProps) => {
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [clips, setClips] = useState<ClipSummary[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [fallbackUsed, setFallbackUsed] = useState<boolean>(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState<'all' | string>('all')
  const [shotFilter, setShotFilter] = useState<'all' | 'with' | 'without'>('all')

  const adapterFactory = useMemo(() => (dataMode === 'cloud' ? createCloudAdapter : createLocalAdapter), [dataMode])

  useEffect(() => {
    let cancelled = false
    const adapter = adapterFactory()

    const run = async () => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      setFallbackUsed(false)
      setStatus('checking')

      const healthy = await adapter.health()
      if (!cancelled) {
        setStatus(healthy ? 'online' : 'offline')
      }

      let remoteLoaded = false
      let remoteError: string | null = null

      try {
        const result = await adapter.listClips()
        if (cancelled) return
        const summaries = result.items.map(toClipSummary)
        setClips(summaries)
        remoteLoaded = true
        if (!healthy) {
          setStatus('online')
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Clip fetch failed', err)
        }
        remoteError =
          adapter.mode === 'cloud'
            ? 'Cloud adapter not connected yet. Using cached clips if available.'
            : 'Could not reach local API. Using cached clips if available.'
      }

      if (!remoteLoaded && !cancelled) {
        const fallback = loadCachedClips().map(toClipSummary)
        if (fallback.length) {
          setClips(fallback)
          setFallbackUsed(true)
          if (!healthy) setStatus('offline')
          setError(remoteError)
        } else {
          setClips([])
          setError(
            remoteError ??
              (healthy
                ? 'No clips returned from API.'
                : 'Local API offline and no cached clips found. Start media_server.py to enable syncing.'),
          )
        }
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [adapterFactory, refreshKey])

  const availableLocations = useMemo(() => {
    const values = new Set<string>()
    clips
      .map((clip) => clip.locationLabel)
      .filter((value) => value && value !== '—')
      .forEach((value) => values.add(value))
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [clips])

  const filteredClips = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return clips.filter((clip) => {
      if (locationFilter !== 'all' && clip.locationLabel !== locationFilter) {
        return false
      }

      if (shotFilter === 'with' && !clip.hasShot) {
        return false
      }
      if (shotFilter === 'without' && clip.hasShot) {
        return false
      }

      if (!term) return true

      const haystack = [
        clip.id,
        clip.game,
        clip.opponent,
        clip.playResult,
        clip.shooterDesignation,
        clip.shotResult,
        clip.notesPreview,
        clip.locationLabel,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [clips, searchTerm, locationFilter, shotFilter])

  const totalCount = clips.length
  const displayedCount = filteredClips.length
  const filtersActive =
    Boolean(searchTerm.trim()) || locationFilter !== 'all' || shotFilter !== 'all'

  const clearFilters = () => {
    setSearchTerm('')
    setLocationFilter('all')
    setShotFilter('all')
  }

  const statusStyles = statusBadgeStyles[status]

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#0f1012] px-6 py-6 text-white">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-sm font-medium uppercase tracking-[0.4em] text-white/60">Clips</span>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${statusStyles.text}`}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusStyles.dot}`} />
          {status === 'checking' ? 'Checking connection…' : status === 'online' ? 'API connected' : 'Offline'}
        </span>
        <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
          {dataMode === 'local' ? 'Local API' : 'Cloud API'}
        </span>
        {fallbackUsed && (
          <span className="rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs uppercase tracking-[0.3em] text-amber-100">
            Fallback cache
          </span>
        )}
        {loading && <span className="text-xs text-white/50">Loading…</span>}
        {!loading && (
          <span className="text-xs text-white/50">
            Showing {displayedCount} of {totalCount} clip{totalCount === 1 ? '' : 's'}
          </span>
        )}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-white/10 bg-[#131721] px-4 py-4 text-sm text-white">
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-[#1b1f2a] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[#841617]"
          type="search"
          placeholder="Search clips (ID, opponent, result, notes…)"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select
          className="rounded-lg border border-white/10 bg-[#1b1f2a] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[#841617]"
          value={locationFilter}
          onChange={(event) => setLocationFilter(event.target.value)}
        >
          <option value="all">All locations</option>
          {availableLocations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-white/10 bg-[#1b1f2a] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[#841617]"
          value={shotFilter}
          onChange={(event) => setShotFilter(event.target.value as typeof shotFilter)}
        >
          <option value="all">All clips</option>
          <option value="with">With shot data</option>
          <option value="without">Without shot data</option>
        </select>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!filtersActive}
          className="rounded-full border border-white/12 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:text-white/40"
        >
          Clear filters
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#131721]">
        <div className="h-full overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[#1c2130] text-xs uppercase text-white/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Clip ID</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Game</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Date</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Opponent</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Location</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Result</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Shooter</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Shot</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Notes</th>
                <th className="px-4 py-3 text-left font-semibold tracking-widest">Saved</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-white/60">
                    Loading clips…
                  </td>
                </tr>
              ) : filteredClips.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-white/60">
                    {totalCount === 0
                      ? 'No clips available. Save clips in the tagger to populate this list.'
                      : 'No clips match the current filters.'}
                  </td>
                </tr>
              ) : (
                filteredClips.map((clip) => (
                  <tr key={clip.id} className="border-b border-white/5 last:border-none hover:bg-white/5">
                    <td className="px-4 py-3 font-mono text-xs text-white/70">
                      {onOpenClip ? (
                        <button
                          type="button"
                          onClick={() => onOpenClip(clip.id, clip)}
                          className="underline-offset-2 hover:underline"
                        >
                          {clip.id}
                        </button>
                      ) : (
                        clip.id
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/80">{clip.game}</td>
                    <td className="px-4 py-3 text-white/70">{clip.gameDateDisplay}</td>
                    <td className="px-4 py-3 text-white/90">{clip.opponent}</td>
                    <td className="px-4 py-3 text-white/80">{clip.locationLabel}</td>
                    <td className="px-4 py-3 text-white/80">{clip.playResult}</td>
                    <td className="px-4 py-3 text-white/80">{clip.shooterDesignation}</td>
                    <td className="px-4 py-3 text-white/80">
                      {clip.hasShot ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-100">
                          Shot
                          <span className="font-medium text-emerald-200">{clip.shotResult}</span>
                        </span>
                      ) : (
                        <span className="text-white/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/70">{clip.notesPreview}</td>
                    <td className="px-4 py-3 text-white/70">{clip.savedAtDisplay}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default ReactClipsPanel
