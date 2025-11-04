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
        { label: 'Opponent', value: activeClip?.opponent },
        { label: 'Quarter', value: summary?.game ?? activeClip?.gameNumber },
        { label: 'Possession #', value: activeClip?.possessionResult ?? summary?.playResult },
        { label: 'Situation', value: activeClip?.situation ?? activeClip?.playType ?? '—' },
        { label: 'Location', value: locationLabel },
      ],
    },
    {
      icon: '🎯',
      title: 'Play & Actions',
      rows: [
        { label: 'Play Name', value: activeClip?.playName ?? activeClip?.playResult },
        { label: 'Action Trigger', value: activeClip?.actionTrigger },
        { label: 'Action Type(s)', value: activeClip?.actionTypes },
        { label: 'Action Sequence', value: activeClip?.actionSequence },
        { label: 'Covered in Scout?', value: activeClip?.scoutCoverage },
      ],
    },
    {
      icon: '🛡️',
      title: 'Defensive Coverage',
      rows: [
        { label: 'Coverage', value: activeClip?.coverage },
        { label: 'Ball Screen', value: activeClip?.ballScreen },
        { label: 'Off-Ball Screen', value: activeClip?.offBallScreen },
        { label: 'Help/Rotation', value: activeClip?.helpRotation },
        { label: 'Disruption', value: activeClip?.disruption },
      ],
    },
    {
      icon: '🏀',
      title: 'Shot Data',
      rows: [
        { label: 'Shooter', value: activeClip?.shooterDesignation },
        { label: 'Result', value: activeClip?.shotResult },
        { label: 'Shot Location', value: formatShotLocation() },
        { label: 'Contest', value: activeClip?.shotContest },
        { label: 'Rebound', value: activeClip?.rebound },
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

      <section className="video-section">
        {activeClip?.videoUrl ? (
          <video controls src={activeClip.videoUrl} className="clip-video" />
        ) : (
          <div className="video-placeholder">No video reference found for this clip.</div>
        )}
      </section>

      <section className="analytics-section">
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

      <section className="accordion-container">
        {accordionSections.map((section) => (
          <article key={section.title} className="accordion-section">
            <input type="checkbox" className="accordion-toggle" id={section.title} />
            <label className="accordion-header" htmlFor={section.title}>
              <div className="accordion-title">
                <span className="accordion-icon">{section.icon}</span>
                {section.title}
              </div>
              <span className="accordion-chevron">▼</span>
            </label>
            <div className="accordion-content">
              <table className="info-table">
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.value ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

export default ReactClipDetail
