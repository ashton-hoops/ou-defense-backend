import { useEffect, useMemo, useState } from 'react'
import { createCloudAdapter, createLocalAdapter } from '../lib/data'
import type { DataMode } from '../lib/data'
import type { Clip } from '../lib/types'
import { findCachedClip, normalizeClip, resolveLocationLabel, type ClipSummary } from '../lib/data/transformers'
import './ReactClipDetail.css'

type ReactClipDetailProps = {
  clipId: string | null
  dataMode: DataMode
  onBack?: () => void
  onClipUpdated?: (clip: Clip) => void
  summary?: ClipSummary
}

const connectionLabel = {
  checking: 'Checking connection…',
  online: 'API connected',
  offline: 'Offline',
} as const

const ReactClipDetail = ({ clipId, dataMode, onBack, summary }: ReactClipDetailProps) => {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [clip, setClip] = useState<Clip | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const adapterFactory = useMemo(() => (dataMode === 'cloud' ? createCloudAdapter : createLocalAdapter), [dataMode])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!clipId) {
        setClip(null)
        setLoading(false)
        setError('Select a clip to view detail.')
        return
      }
      setLoading(true)
      setError(null)
      setStatus('checking')
      const adapter = adapterFactory()
      const healthy = await adapter.health()
      if (!cancelled) setStatus(healthy ? 'online' : 'offline')
      try {
        const data = await adapter.getClip(clipId)
        if (cancelled) return
        if (data) {
          setClip(normalizeClip(data))
          setLoading(false)
          return
        }
        setError('Clip not found in API; checking cache…')
      } catch (err) {
        if (!cancelled) {
          console.warn('React clip detail failed', err)
          setError(
            adapter.mode === 'cloud'
              ? 'Cloud adapter not reachable; checking cache.'
              : 'Local API offline; checking cache.',
          )
        }
      }

      if (cancelled) return
      const cached = findCachedClip(clipId)
      if (cached) {
        setClip(normalizeClip(cached))
        setLoading(false)
        return
      }

      setClip(null)
      setLoading(false)
      setError((prev) => prev ?? 'No clip data available yet. Save from the tagger first.')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [adapterFactory, clipId])

  const activeClip = clip ?? (summary ? (normalizeClip(summary) as Clip) : null)
  const locationLabel = activeClip ? resolveLocationLabel(activeClip) : '—'
  const points = activeClip?.points ?? 0
  const breakdown = activeClip?.breakdown
  const stop = breakdown ? !breakdown.toLowerCase().startsWith('y') : true

  const formatShotLocation = () => {
    if (activeClip?.shotX == null || activeClip?.shotY == null) return '—'
    return `${activeClip.shotX.toFixed(1)}, ${activeClip.shotY.toFixed(1)}`
  }

  const accordionSections = [
    {
      icon: '📋',
      title: 'Context & Identifiers',
      rows: [
        { label: 'Game #', value: activeClip?.gameId },
        { label: 'Location', value: locationLabel },
        { label: 'Opponent', value: activeClip?.opponent },
        { label: 'Quarter', value: activeClip?.quarter ?? summary?.game ?? activeClip?.gameNumber },
        { label: 'Possession #', value: activeClip?.possession ?? activeClip?.possessionResult ?? summary?.playResult },
        { label: 'Situation', value: activeClip?.situation ?? activeClip?.playType },
      ],
    },
    {
      icon: '🎯',
      title: 'Play & Actions',
      rows: [
        { label: 'Offensive Formation', value: activeClip?.formation },
        { label: 'Play Name', value: activeClip?.playName },
        { label: 'Covered in Scout?', value: activeClip?.scoutCoverage },
        { label: 'Action Trigger', value: activeClip?.actionTrigger },
        { label: 'Action Type(s)', value: activeClip?.actionTypes },
        { label: 'Action Sequence', value: activeClip?.actionSequence },
      ],
    },
    {
      icon: '🛡️',
      title: 'Defensive Coverage',
      rows: [
        { label: 'Defensive Coverage', value: activeClip?.coverage },
        { label: 'Ball Screen Coverage', value: activeClip?.ballScreen },
        { label: 'Off-Ball Screen Coverage', value: activeClip?.offBallScreen },
        { label: 'Help/Rotation', value: activeClip?.helpRotation },
        { label: 'Defensive Disruption', value: activeClip?.disruption },
        { label: 'Defensive Breakdown', value: activeClip?.breakdown },
      ],
    },
    {
      icon: '🏀',
      title: 'Shot Data',
      rows: [
        { label: 'Play Result', value: activeClip?.result },
        { label: 'Paint Touches', value: activeClip?.paintTouch },
        { label: 'Shooter Designation', value: activeClip?.shooter },
        { label: 'Shot Location', value: activeClip?.shotLocation },
        { label: 'Shot Contest', value: activeClip?.contest },
        { label: 'Rebound Outcome', value: activeClip?.rebound },
        { label: 'Points', value: activeClip?.points },
      ],
    },
  ]

  return (
    <div className="clip-detail">
      <header className="clip-detail__header">
        <div>
          <p className="clip-detail__eyebrow">React clip detail</p>
          <h2>
            Game {activeClip?.gameId ?? '—'} vs {activeClip?.opponent ?? summary?.opponent ?? '—'}
          </h2>
          <p className="clip-detail__meta">
            {locationLabel} • {activeClip?.playResult ?? summary?.playResult ?? 'Play result pending'}
          </p>
        </div>
        <div className="clip-detail__actions">
          <span className={`status-pill status-pill--${status}`}>{connectionLabel[status]}</span>
          <button type="button" onClick={onBack} className="clip-detail__back">
            ← Back to clips
          </button>
        </div>
      </header>

      {error && <div className="clip-detail__error">{error}</div>}

      <div className="clip-detail__content">
        <div className="clip-detail__main-column">
          <section className="video-section">
            {activeClip?.videoUrl ? (
              <video controls src={activeClip.videoUrl} className="clip-video" />
            ) : (
              <div className="video-placeholder">No video reference found for this clip.</div>
            )}
          </section>

          {/* Comprehensive Analytics below video */}
          <section className="comprehensive-analytics">
            <div className="analytics-header">
              <span className="analytics-icon">📊</span>
              <span>Comprehensive Analytics</span>
            </div>
            <div className="stats-summary">
              <div className="stat-card">
                <p className="stat-value">{points.toFixed(2)}</p>
                <p className="stat-label">PPP Allowed</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{stop ? '100%' : '0%'}</p>
                <p className="stat-label">Stop Rate</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{activeClip?.hasShot ? 'Shot' : 'No Shot'}</p>
                <p className="stat-label">Shot Record</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{activeClip?.shotResult ?? '—'}</p>
                <p className="stat-label">Shot Result</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{activeClip?.breakdown ? 'Yes' : 'No'}</p>
                <p className="stat-label">Breakdown</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{activeClip?.disruption ?? '—'}</p>
                <p className="stat-label">Disruption</p>
              </div>
            </div>
          </section>

          {/* Context & Identifiers below analytics */}
          <section className="context-section">
            <div className="analytics-header">
              <span className="analytics-icon">📋</span>
              <span>Context & Identifiers</span>
            </div>
            <div className="detail-grid detail-grid--wide">
              {accordionSections[0].rows.map((row) => (
                <div key={row.label} className="detail-card">
                  <p className="detail-value">{row.value ?? '—'}</p>
                  <p className="detail-label">{row.label}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="analytics-sidebar">
          {/* Analytics & Insights */}
          <section className="sidebar-section">
            <div className="analytics-header">
              <span className="analytics-icon">📊</span>
              <span>Analytics & Insights</span>
            </div>
            <div className="stats-summary">
              <div className="stat-card">
                <p className="stat-value">{points.toFixed(2)}</p>
                <p className="stat-label">PPP Allowed</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{stop ? '100%' : '0%'}</p>
                <p className="stat-label">Stop Rate</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{activeClip?.hasShot ? 'Shot' : 'No Shot'}</p>
                <p className="stat-label">Shot Record</p>
              </div>
              <div className="stat-card">
                <p className="stat-value">{activeClip?.shotResult ?? '—'}</p>
                <p className="stat-label">Shot Result</p>
              </div>
            </div>
            <div className="notes-box">
              <p className="notes-label">Notes</p>
              <p className="notes-value">{activeClip?.notes ?? 'No notes recorded.'}</p>
            </div>
          </section>

          {/* Play & Actions */}
          <section className="sidebar-section">
            <div className="analytics-header">
              <span className="analytics-icon">🎯</span>
              <span>Play & Actions</span>
            </div>
            <div className="detail-grid">
              {accordionSections[1].rows.map((row) => (
                <div key={row.label} className="detail-card">
                  <p className="detail-value">{row.value ?? '—'}</p>
                  <p className="detail-label">{row.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Defensive Coverage */}
          <section className="sidebar-section">
            <div className="analytics-header">
              <span className="analytics-icon">🛡️</span>
              <span>Defensive Coverage</span>
            </div>
            <div className="detail-grid">
              {accordionSections[2].rows.map((row) => (
                <div key={row.label} className="detail-card">
                  <p className="detail-value">{row.value ?? '—'}</p>
                  <p className="detail-label">{row.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Shot Data */}
          <section className="sidebar-section">
            <div className="analytics-header">
              <span className="analytics-icon">🏀</span>
              <span>Shot Data</span>
            </div>
            <div className="detail-grid">
              {accordionSections[3].rows.map((row) => (
                <div key={row.label} className="detail-card">
                  <p className="detail-value">{row.value ?? '—'}</p>
                  <p className="detail-label">{row.label}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default ReactClipDetail
