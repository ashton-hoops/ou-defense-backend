import { useState, useEffect, useRef } from 'react'
import type { Clip } from '../lib/types'
import { FloatingPicker } from './tagger/FloatingPicker'
import './ClipEditModal.css'

type ClipEditModalProps = {
  clip: Clip
  isOpen: boolean
  onClose: () => void
  onSave: (clipId: string, updates: Partial<Clip>) => Promise<void>
  onDelete?: (clipId: string) => Promise<void>
}

const FIELD_OPTIONS: Record<string, string[]> = {
  situation: ['Half Court', 'Transition', 'SLOB', 'BLOB', 'Early Offense', 'Half Court (ATO)'],
  scoutCoverage: ['Yes – Practiced', 'Partial – Similar Action', 'No – Not Practiced'],
  coverage: [
    'Man',
    '2-3',
    '3-2',
    '1-3-1',
    '1-2-2',
    'Full Court Man',
    '2-2-1 Press',
    '1-2-1-1 Press (Diamond)',
  ],
  ballScreen: [
    'Under',
    'Over',
    'ICE',
    'Weak (Force Weak Hand)',
    'Switch',
    'Hard Hedge',
    'Soft Hedge/Show',
    'Peel Switch',
    'Blitz (Trap)',
  ],
  offBallScreen: ['Attach/Stay', 'Over', 'Under', 'Top-Lock', 'Switch', 'Show'],
  helpRotation: [
    'No Help / No Rotation',
    'Low-Man Help',
    'X-Out Rotation',
    'Sink / Fill',
    'Full Rotation',
    'Late Help',
    'No Rotation (Missed)',
    'Peel Help',
  ],
  disruption: [
    'Denied Wing Entry',
    'Denied Post Entry',
    'Pressured Ball Handler to Prevent Pass',
    'Deflected Pass',
  ],
  breakdown: ['Yes', 'No'],
  playResult: [
    'Made FG',
    'Missed FG',
    'And-One',
    'Live-Ball Turnover',
    'Dead-Ball Turnover',
    'Turnover (Shot Clock Violation)',
    'Shooting Foul',
    'Off-Ball Foul',
    'Reach-In Foul',
    'Loose-Ball Foul',
    'Deflection (Out of Bounds)',
  ],
  shooterDesignation: ['Blue', 'Green', 'Black'],
  paintTouches: [
    'No Paint Touch',
    'Drive Baseline',
    'Drive Middle',
    'Post Touch - Low Block',
    'Post Touch - High Post',
    'Cut to Paint (Received Pass)',
  ],
  shotLocation: [
    'At Rim (0–4 ft)',
    'Paint (5–10 ft)',
    'Short Midrange (11–14 ft)',
    'Long Midrange (15–20 ft)',
    'Corner 3 (21 ft 6 in)',
    'Wing/Top 3 (22–23 ft)',
    'Deep 3 (24–26 ft)',
    'Late Clock / Heave (27 ft +)',
  ],
  shotContest: [
    'Open (4+ ft)',
    'Light Contest / Late High-Hand (2–4 ft)',
    'Contested/On-Time High-Hand (1–2 ft)',
    'Heavy Contest / Early High-Hand (0–1 ft)',
    'Blocked',
  ],
  rebound: ['DREB', 'OREB', 'Other'],
}

const ClipEditModal = ({ clip, isOpen, onClose, onSave, onDelete }: ClipEditModalProps) => {
  const [formData, setFormData] = useState<Partial<Clip>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    context: true,
    playActions: false,
    defensive: false,
    shotData: false,
    notes: false,
  })

  const [pickerState, setPickerState] = useState<{
    field: string | null
    inputRef: HTMLInputElement | null
  }>({ field: null, inputRef: null })

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (isOpen && clip) {
      setFormData({
        gameId: clip.gameId,
        location: clip.location ?? clip.locationDisplay ?? clip.gameLocation,
        opponent: clip.opponent,
        quarter: clip.quarter,
        possession: clip.possession,
        situation: clip.situation,
        formation: clip.formation,
        playName: clip.playName,
        scoutCoverage: clip.scoutCoverage,
        actionTrigger: clip.actionTrigger,
        actionTypes: clip.actionTypes,
        actionSequence: clip.actionSequence,
        coverage: clip.coverage,
        ballScreen: clip.ballScreen,
        offBallScreen: clip.offBallScreen,
        helpRotation: clip.helpRotation,
        disruption: clip.disruption,
        breakdown: clip.breakdown,
        playResult: clip.playResult,
        shooterDesignation: clip.shooterDesignation,
        paintTouches: clip.paintTouches,
        shotLocation: clip.shotLocation,
        shotContest: clip.shotContest,
        rebound: clip.rebound,
        points: clip.points,
        notes: clip.notes,
      })
      setError(null)
    }
  }, [isOpen, clip])

  const handleChange = (field: keyof Clip, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handleInputFocus = (field: string, input: HTMLInputElement) => {
    if (field in FIELD_OPTIONS) {
      setPickerState({ field, inputRef: input })
    }
  }

  const handlePickerSelect = (value: string) => {
    if (!pickerState.field || !pickerState.inputRef) return

    const currentValue = pickerState.inputRef.value
    const parts = currentValue.split(',').map((s) => s.trim()).filter(Boolean)
    parts.push(value)
    const newValue = parts.join(', ')

    handleChange(pickerState.field as keyof Clip, newValue)

    setTimeout(() => {
      if (pickerState.inputRef) {
        pickerState.inputRef.focus()
        pickerState.inputRef.selectionStart = pickerState.inputRef.selectionEnd = newValue.length
      }
    }, 0)
  }

  const handlePickerClose = () => {
    setPickerState({ field: null, inputRef: null })
  }

  const getInputProps = (field: string) => {
    const hasOptions = field in FIELD_OPTIONS
    return hasOptions
      ? {
          onFocus: (e: React.FocusEvent<HTMLInputElement>) => handleInputFocus(field, e.target),
          onClick: (e: React.MouseEvent<HTMLInputElement>) =>
            handleInputFocus(field, e.target as HTMLInputElement),
          ref: (el: HTMLInputElement | null) => {
            inputRefs.current[field] = el
          },
        }
      : {
          ref: (el: HTMLInputElement | null) => {
            inputRefs.current[field] = el
          },
        }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      console.log('[DEBUG] ClipEditModal formData being saved:', formData)
      await onSave(clip.id, formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save clip')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="clip-edit-overlay" onClick={onClose} />
      <div className="clip-edit-modal">
        <div className="clip-edit-header">
          <div>
            <h3 className="clip-edit-title">Edit Clip</h3>
            <p className="clip-edit-subtitle">
              {clip.gameId} • {clip.opponent}
            </p>
          </div>
          <button type="button" onClick={onClose} className="clip-edit-close">
            ✕
          </button>
        </div>

        <div className="clip-edit-content">
          {error && <div className="clip-edit-error">{error}</div>}

          {/* 📋 Context & Identifiers */}
          <div className={`clip-edit-section ${expandedSections.context ? '' : 'collapsed'}`}>
            <h4 className="clip-edit-section-title" onClick={() => toggleSection('context')}>
              <span>📋 Context & Identifiers</span>
              <span className="clip-edit-toggle">{expandedSections.context ? '−' : '+'}</span>
            </h4>
            {expandedSections.context && (
              <div className="clip-edit-grid">
                <div className="clip-edit-field">
                  <label>Game #</label>
                  <input
                    type="text"
                    value={formData.gameId ?? ''}
                    onChange={(e) => handleChange('gameId', e.target.value)}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Location</label>
                  <input
                    type="text"
                    value={formData.location ?? ''}
                    onChange={(e) => handleChange('location', e.target.value)}
                    placeholder="Home / Away / Neutral"
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Opponent</label>
                  <input
                    type="text"
                    value={formData.opponent ?? ''}
                    onChange={(e) => handleChange('opponent', e.target.value)}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Quarter</label>
                  <input
                    type="text"
                    value={formData.quarter ?? ''}
                    onChange={(e) => handleChange('quarter', e.target.value)}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Possession #</label>
                  <input
                    type="text"
                    value={formData.possession ?? ''}
                    onChange={(e) => handleChange('possession', e.target.value)}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Situation</label>
                  <input
                    type="text"
                    value={formData.situation ?? ''}
                    onChange={(e) => handleChange('situation', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('situation')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 🎯 Play & Actions */}
          <div className={`clip-edit-section ${expandedSections.playActions ? '' : 'collapsed'}`}>
            <h4 className="clip-edit-section-title" onClick={() => toggleSection('playActions')}>
              <span>🎯 Play & Actions</span>
              <span className="clip-edit-toggle">{expandedSections.playActions ? '−' : '+'}</span>
            </h4>
            {expandedSections.playActions && (
              <div className="clip-edit-grid">
                <div className="clip-edit-field clip-edit-field-full">
                  <label>Offensive Formation</label>
                  <input
                    type="text"
                    value={formData.formation ?? ''}
                    onChange={(e) => handleChange('formation', e.target.value)}
                    placeholder="e.g., Horns, 5-Out, 1-4 High"
                  />
                </div>
                <div className="clip-edit-field clip-edit-field-full">
                  <label>Play Name</label>
                  <input
                    type="text"
                    value={formData.playName ?? ''}
                    onChange={(e) => handleChange('playName', e.target.value)}
                    placeholder="e.g., Elbow, Stack, Zoom"
                  />
                </div>
                <div className="clip-edit-field clip-edit-field-full">
                  <label>Covered in Scout?</label>
                  <input
                    type="text"
                    value={formData.scoutCoverage ?? ''}
                    onChange={(e) => handleChange('scoutCoverage', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('scoutCoverage')}
                  />
                </div>
                <div className="clip-edit-field clip-edit-field-full">
                  <label>Action Trigger</label>
                  <input
                    type="text"
                    value={formData.actionTrigger ?? ''}
                    onChange={(e) => handleChange('actionTrigger', e.target.value)}
                    placeholder="e.g., Entry, DHO, Ball Screen"
                  />
                </div>
                <div className="clip-edit-field clip-edit-field-full">
                  <label>Action Type(s)</label>
                  <input
                    type="text"
                    value={formData.actionTypes ?? ''}
                    onChange={(e) => handleChange('actionTypes', e.target.value)}
                    placeholder="Comma-separated actions"
                  />
                </div>
                <div className="clip-edit-field clip-edit-field-full">
                  <label>Action Sequence</label>
                  <input
                    type="text"
                    value={formData.actionSequence ?? ''}
                    onChange={(e) => handleChange('actionSequence', e.target.value)}
                    placeholder="Describe the sequence of actions"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 🛡️ Defensive Coverage */}
          <div className={`clip-edit-section ${expandedSections.defensive ? '' : 'collapsed'}`}>
            <h4 className="clip-edit-section-title" onClick={() => toggleSection('defensive')}>
              <span>🛡️ Defensive Coverage</span>
              <span className="clip-edit-toggle">{expandedSections.defensive ? '−' : '+'}</span>
            </h4>
            {expandedSections.defensive && (
              <div className="clip-edit-grid">
                <div className="clip-edit-field">
                  <label>Defensive Coverage</label>
                  <input
                    type="text"
                    value={formData.coverage ?? ''}
                    onChange={(e) => handleChange('coverage', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('coverage')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Ball Screen Coverage</label>
                  <input
                    type="text"
                    value={formData.ballScreen ?? ''}
                    onChange={(e) => handleChange('ballScreen', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('ballScreen')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Off-Ball Screen Coverage</label>
                  <input
                    type="text"
                    value={formData.offBallScreen ?? ''}
                    onChange={(e) => handleChange('offBallScreen', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('offBallScreen')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Help/Rotation</label>
                  <input
                    type="text"
                    value={formData.helpRotation ?? ''}
                    onChange={(e) => handleChange('helpRotation', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('helpRotation')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Defensive Disruption</label>
                  <input
                    type="text"
                    value={formData.disruption ?? ''}
                    onChange={(e) => handleChange('disruption', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('disruption')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Defensive Breakdown</label>
                  <input
                    type="text"
                    value={formData.breakdown ?? ''}
                    onChange={(e) => handleChange('breakdown', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('breakdown')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 🏀 Shot Data */}
          <div className={`clip-edit-section ${expandedSections.shotData ? '' : 'collapsed'}`}>
            <h4 className="clip-edit-section-title" onClick={() => toggleSection('shotData')}>
              <span>🏀 Shot Data</span>
              <span className="clip-edit-toggle">{expandedSections.shotData ? '−' : '+'}</span>
            </h4>
            {expandedSections.shotData && (
              <div className="clip-edit-grid">
                <div className="clip-edit-field">
                  <label>Play Result</label>
                  <input
                    type="text"
                    value={formData.playResult ?? ''}
                    onChange={(e) => handleChange('playResult', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('playResult')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Paint Touches</label>
                  <input
                    type="text"
                    value={formData.paintTouches ?? ''}
                    onChange={(e) => handleChange('paintTouches', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('paintTouches')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Shooter Designation</label>
                  <input
                    type="text"
                    value={formData.shooterDesignation ?? ''}
                    onChange={(e) => handleChange('shooterDesignation', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('shooterDesignation')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Shot Location</label>
                  <input
                    type="text"
                    value={formData.shotLocation ?? ''}
                    onChange={(e) => handleChange('shotLocation', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('shotLocation')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Shot Contest</label>
                  <input
                    type="text"
                    value={formData.shotContest ?? ''}
                    onChange={(e) => handleChange('shotContest', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('shotContest')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Rebound Outcome</label>
                  <input
                    type="text"
                    value={formData.rebound ?? ''}
                    onChange={(e) => handleChange('rebound', e.target.value)}
                    placeholder="Click to select or type..."
                    {...getInputProps('rebound')}
                  />
                </div>
                <div className="clip-edit-field">
                  <label>Points</label>
                  <input
                    type="number"
                    value={formData.points ?? ''}
                    onChange={(e) => handleChange('points', e.target.value ? Number(e.target.value) : '')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 📝 Notes */}
          <div className={`clip-edit-section ${expandedSections.notes ? '' : 'collapsed'}`}>
            <h4 className="clip-edit-section-title" onClick={() => toggleSection('notes')}>
              <span>📝 Notes</span>
              <span className="clip-edit-toggle">{expandedSections.notes ? '−' : '+'}</span>
            </h4>
            {expandedSections.notes && (
              <div className="clip-edit-grid">
                <div className="clip-edit-field clip-edit-field-full">
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    value={formData.notes ?? ''}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder="Add any additional notes or observations..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="clip-edit-footer">
          <div className="flex gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(clip.id)}
                className="clip-edit-btn clip-edit-btn-delete"
                disabled={saving}
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="clip-edit-btn clip-edit-btn-cancel" disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} className="clip-edit-btn clip-edit-btn-save" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {pickerState.field && pickerState.inputRef && (
        <FloatingPicker
          inputRef={pickerState.inputRef}
          options={FIELD_OPTIONS[pickerState.field] || []}
          isOpen={true}
          onSelect={handlePickerSelect}
          onClose={handlePickerClose}
        />
      )}
    </>
  )
}

export default ClipEditModal
