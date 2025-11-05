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
import type { Clip } from '../lib/types'
import ClipEditModal from './ClipEditModal'

type ConnectionStatus = 'checking' | 'online' | 'offline'

type ReactClipsPanelProps = {
  dataMode: DataMode
  onOpenClip?: (clipId: string, summary: ClipSummary) => void
  refreshKey?: number
}

const statusBadgeStyles: Record<ConnectionStatus, { dot: string; text: string }> = {
  checking: { dot: 'bg-amber-400', text: 'bg-amber-500/20 text-amber-100 border border-amber-400/40' },
  online: { dot: 'bg-white/70', text: 'bg-white/10 text-white/90 border border-white/20' },
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
  const [editingClip, setEditingClip] = useState<Clip | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [expandedGames, setExpandedGames] = useState<Set<string>>(new Set())

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

  const clipsByGame = useMemo(() => {
    const grouped = new Map<string, ClipSummary[]>()
    filteredClips.forEach((clip) => {
      const gameKey = clip.game || 'Unknown Game'
      if (!grouped.has(gameKey)) {
        grouped.set(gameKey, [])
      }
      grouped.get(gameKey)!.push(clip)
    })
    return Array.from(grouped.entries()).sort((a, b) => {
      const numA = parseInt(a[0], 10)
      const numB = parseInt(b[0], 10)
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB
      }
      return a[0].localeCompare(b[0])
    })
  }, [filteredClips])

  const totalCount = clips.length
  const displayedCount = filteredClips.length
  const filtersActive =
    Boolean(searchTerm.trim()) || locationFilter !== 'all' || shotFilter !== 'all'

  const clearFilters = () => {
    setSearchTerm('')
    setLocationFilter('all')
    setShotFilter('all')
  }

  const toggleGame = (gameKey: string) => {
    setExpandedGames((prev) => {
      const next = new Set(prev)
      if (next.has(gameKey)) {
        next.delete(gameKey)
      } else {
        next.add(gameKey)
      }
      return next
    })
  }

  const handleDeleteClip = async (clipId: string) => {
    if (!confirm('Are you sure you want to delete this clip? This cannot be undone.')) {
      return
    }
    try {
      const adapter = adapterFactory()
      await adapter.deleteClip(clipId)
      const result = await adapter.listClips()
      const summaries = result.items.map(toClipSummary)
      setClips(summaries)
      setIsEditModalOpen(false)
      setEditingClip(null)
    } catch (err) {
      console.error('Failed to delete clip:', err)
      alert('Failed to delete clip. Please try again.')
    }
  }

  const handleEditClip = async (clipId: string) => {
    try {
      const adapter = adapterFactory()
      const fullClip = await adapter.getClip(clipId)
      if (fullClip) {
        setEditingClip(fullClip)
        setIsEditModalOpen(true)
      }
    } catch (err) {
      console.error('Failed to load clip for editing:', err)
      alert('Failed to load clip. Please try again.')
    }
  }

  const handleSaveClip = async (clipId: string, updates: Partial<Clip>) => {
    const adapter = adapterFactory()

    console.log('[DEBUG] handleSaveClip received updates:', updates)

    // Build update payload
    const payload: any = {}
    if (updates.gameId !== undefined) payload.game_id = updates.gameId
    if (updates.location !== undefined) payload.location = updates.location
    if (updates.opponent !== undefined) payload.opponent = updates.opponent
    if (updates.playResult !== undefined) payload.result = updates.playResult
    if (updates.notes !== undefined) payload.notes = updates.notes
    if (updates.shooterDesignation !== undefined) payload.shooter = updates.shooterDesignation
    if (updates.quarter !== undefined) payload.quarter = updates.quarter
    if (updates.possession !== undefined) payload.possession = updates.possession
    if (updates.situation !== undefined) payload.situation = updates.situation
    if (updates.formation !== undefined) payload.formation = updates.formation
    if (updates.playName !== undefined) payload.play_name = updates.playName
    if (updates.scoutCoverage !== undefined) payload.scout_coverage = updates.scoutCoverage
    if (updates.actionTrigger !== undefined) payload.action_trigger = updates.actionTrigger
    if (updates.actionTypes !== undefined) payload.action_types = updates.actionTypes
    if (updates.actionSequence !== undefined) payload.action_sequence = updates.actionSequence
    if (updates.coverage !== undefined) payload.coverage = updates.coverage
    if (updates.ballScreen !== undefined) payload.ball_screen = updates.ballScreen
    if (updates.offBallScreen !== undefined) payload.off_ball_screen = updates.offBallScreen
    if (updates.helpRotation !== undefined) payload.help_rotation = updates.helpRotation
    if (updates.disruption !== undefined) payload.disruption = updates.disruption
    if (updates.breakdown !== undefined) payload.breakdown = updates.breakdown
    if (updates.playType !== undefined) payload.play_type = updates.playType
    if (updates.possessionResult !== undefined) payload.possession_result = updates.possessionResult
    if (updates.defenderDesignation !== undefined) payload.defender_designation = updates.defenderDesignation
    if (updates.paintTouches !== undefined) payload.paint_touches = updates.paintTouches
    if (updates.shotLocation !== undefined) payload.shot_location = updates.shotLocation
    if (updates.shotContest !== undefined) payload.shot_contest = updates.shotContest
    if (updates.shotResult !== undefined) payload.shot_result = updates.shotResult
    if (updates.shotQuality !== undefined) payload.shot_quality = updates.shotQuality
    if (updates.rebound !== undefined) payload.rebound = updates.rebound
    if (updates.points !== undefined) payload.points = updates.points

    console.log('[DEBUG] Sending payload to API:', payload)

    await adapter.updateClip(clipId, payload)

    // Refresh the clips list
    const result = await adapter.listClips()
    const summaries = result.items.map(toClipSummary)
    setClips(summaries)
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

      <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-white/10 bg-[#151515] px-4 py-4 text-sm text-white">
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[#841617]"
          type="search"
          placeholder="Search clips (ID, opponent, result, notes…)"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select
          className="rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[#841617]"
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
          className="rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[#841617]"
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

      <div className="mt-4 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#151515]">
        <div className="h-full overflow-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-white/60">Loading clips…</div>
          ) : clipsByGame.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/60">
              {totalCount === 0
                ? 'No clips available. Save clips in the tagger to populate this list.'
                : 'No clips match the current filters.'}
            </div>
          ) : (
            clipsByGame.map(([gameKey, gameClips]) => {
              const isExpanded = expandedGames.has(gameKey)
              const firstClip = gameClips[0]
              return (
                <div key={gameKey} className="border-b border-white/5 last:border-none">
                  <button
                    type="button"
                    onClick={() => toggleGame(gameKey)}
                    className="flex w-full items-center gap-4 bg-[#1a1a1a] px-4 py-3 text-left transition hover:bg-[#1f1f1f]"
                  >
                    <span className="text-lg text-white/40">{isExpanded ? '▼' : '▶'}</span>
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold uppercase tracking-widest text-white/90">
                          Game {gameKey}
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
                          {gameClips.length} clip{gameClips.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {firstClip.opponent} · {firstClip.locationLabel} · {firstClip.gameDateDisplay}
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-[#181818] text-xs uppercase text-white/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Clip ID</th>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Date</th>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Result</th>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Shooter</th>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Shot</th>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Notes</th>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Saved</th>
                          <th className="px-4 py-2 text-left font-medium tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gameClips.map((clip) => (
                          <tr key={clip.id} className="border-b border-white/5 hover:bg-white/5">
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
                            <td className="px-4 py-3 text-white/70">{clip.gameDateDisplay}</td>
                            <td className="px-4 py-3 text-white/80">{clip.playResult}</td>
                            <td className="px-4 py-3 text-white/80">{clip.shooterDesignation}</td>
                            <td className="px-4 py-3 text-white/80">
                              {clip.hasShot ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/80">
                                  Shot
                                  <span className="font-medium text-white/90">{clip.shotResult}</span>
                                </span>
                              ) : (
                                <span className="text-white/50">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-white/70">{clip.notesPreview}</td>
                            <td className="px-4 py-3 text-white/70">{clip.savedAtDisplay}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEditClip(clip.id)
                                }}
                                className="rounded-lg border border-white/12 bg-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-white transition hover:bg-white/16"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {editingClip && (
        <ClipEditModal
          clip={editingClip}
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setEditingClip(null)
          }}
          onSave={handleSaveClip}
          onDelete={handleDeleteClip}
        />
      )}
    </div>
  )
}

export default ReactClipsPanel
