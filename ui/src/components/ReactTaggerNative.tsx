import { useEffect, useRef, useState } from 'react'
import type { TagFields, QueueEntry } from '../lib/types'
import { createLocalAdapter } from '../lib/data'
import { VideoPane } from './tagger/VideoPane'
import { ControlsBar } from './tagger/ControlsBar'
import { PbpPane } from './tagger/PbpPane'
import { TagsPane } from './tagger/TagsPane'
import { QueueDrawer } from './tagger/QueueDrawer'

const STORAGE_KEY = 'ou_clips_v1'

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const parseTime = (timeStr: string): number => {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 3) {
    const [h, m, s] = parts
    return h * 3600 + m * 60 + s
  }
  return 0
}

const ReactTaggerNative = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const adapterRef = useRef(createLocalAdapter())

  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null)
  const [currentVideoPath, setCurrentVideoPath] = useState<string>('')

  const [inTime, setInTime] = useState('')
  const [outTime, setOutTime] = useState('')
  const [excelRow, setExcelRow] = useState(2)
  const [excelActive, setExcelActive] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [fields, setFields] = useState<TagFields>({
    gameNum: '1',
    gameLocation: '',
    opponent: '',
    quarter: '1',
    possession: '1',
    situation: '',
    offFormation: '',
    playName: '',
    scoutTag: '',
    actionTrigger: '',
    actionTypes: '',
    actionSeq: '',
    coverage: '',
    ballScreenCov: '',
    offBallScreenCov: '',
    helpRotation: '',
    defDisruption: '',
    defBreakdown: '',
    playResult: '',
    paintTouches: '',
    shooterDesignation: '',
    shotLocation: '',
    shotContest: '',
    reboundOutcome: '',
    points: '0',
    notes: '',
  })

  const [clips, setClips] = useState<QueueEntry[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Load clips from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setClips(parsed)
        }
      }
    } catch (err) {
      console.error('Failed to load clips from localStorage:', err)
    }
  }, [])

  // Save clips to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clips))
    } catch (err) {
      console.error('Failed to save clips to localStorage:', err)
    }
  }, [clips])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return

      switch (e.key.toLowerCase()) {
        case 'arrowleft':
          if (videoRef.current) videoRef.current.currentTime += -2
          break
        case 'arrowright':
          if (videoRef.current) videoRef.current.currentTime += 2
          break
        case 'i':
          handleMarkIn()
          break
        case 'o':
          handleMarkOut()
          break
        case 's':
          handleSave()
          break
        case '1':
          if (videoRef.current) videoRef.current.playbackRate = 0.5
          break
        case '2':
          if (videoRef.current) videoRef.current.playbackRate = 1
          break
        case '3':
          if (videoRef.current) videoRef.current.playbackRate = 2
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [fields, inTime, outTime])

  const handleLoadVideo = () => {
    fileInputRef.current?.click()
  }

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCurrentVideoFile(file)
    setCurrentVideoPath(file.name)

    const url = URL.createObjectURL(file)
    setVideoSrc(url)
  }

  const handleVideoLoaded = (video: HTMLVideoElement) => {
    videoRef.current = video
  }

  const handleMarkIn = () => {
    if (videoRef.current && !isNaN(videoRef.current.currentTime)) {
      setInTime(formatTime(videoRef.current.currentTime))
    }
  }

  const handleMarkOut = () => {
    if (videoRef.current && !isNaN(videoRef.current.currentTime)) {
      setOutTime(formatTime(videoRef.current.currentTime))
    }
  }

  const handleFieldChange = (field: keyof TagFields, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!inTime || !outTime) {
      alert('Mark IN and OUT first')
      return
    }

    if (isSaving) {
      return // Prevent double-saves
    }

    // Check for duplicate possession
    const duplicate = clips.find(
      (c) =>
        c['Game #'] === fields.gameNum &&
        c.Opponent === fields.opponent &&
        c.Quarter === fields.quarter &&
        c['Possession #'] === fields.possession
    )

    if (duplicate) {
      const confirmOverwrite = confirm(
        `WARNING: Duplicate Possession Detected!\n\nGame ${fields.gameNum} vs ${fields.opponent}, Q${fields.quarter} P${fields.possession} already exists in the queue.\n\nClick OK to save anyway (will create duplicate)\nClick Cancel to go back and change the possession number`
      )
      if (!confirmOverwrite) return
    }

    setIsSaving(true)

    try {
      const opponentRaw = fields.opponent.trim()
      const gameNum = parseInt(fields.gameNum, 10) || 0
      const slug = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')

      const opponentSlug = slug(opponentRaw)
      const gameId = `G${gameNum}_${opponentSlug}`
      const clipId = `${gameId}_Q${fields.quarter}P${fields.possession}_${Date.now().toString().slice(-6)}`

      // Build queue entry for local display
      const clipData: QueueEntry = {
        __clipId: clipId,
        __gameId: gameId,
        __opponent: opponentRaw,
        __selected: true,
        'Game #': fields.gameNum,
        Location: fields.gameLocation,
        Opponent: fields.opponent,
        Quarter: fields.quarter,
        'Possession #': fields.possession,
        Situation: fields.situation,
        'Offensive Formation': fields.offFormation,
        'Play Name': fields.playName,
        'Covered in Scout?': fields.scoutTag,
        'Action Trigger': fields.actionTrigger,
        'Action Type(s)': fields.actionTypes,
        'Action Sequence': fields.actionSeq,
        'Defensive Coverage': fields.coverage,
        'Ball Screen Coverage': fields.ballScreenCov,
        'Off-Ball Screen Coverage': fields.offBallScreenCov,
        'Help/Rotation': fields.helpRotation,
        'Defensive Disruption': fields.defDisruption,
        'Defensive Breakdown': fields.defBreakdown,
        'Play Result': fields.playResult,
        'Paint Touches': fields.paintTouches,
        'Shooter Designation': fields.shooterDesignation,
        'Shot Location': fields.shotLocation,
        'Shot Contest': fields.shotContest,
        'Rebound Outcome': fields.reboundOutcome,
        'Has Shot': 'No',
        'Shot X': '',
        'Shot Y': '',
        'Shot Result': '',
        Points: fields.points,
        Notes: fields.notes,
        'Start Time': inTime,
        'End Time': outTime,
        q: fields.quarter,
        p: fields.possession,
        start: inTime,
        end: outTime,
        play: fields.playName,
        situation: fields.situation,
        shooter: fields.shooterDesignation,
        res: fields.playResult,
      }

      // Build API payload matching database schema
      const apiPayload = {
        id: clipId,
        filename: currentVideoPath || 'unknown.mp4',
        path: currentVideoPath || '',
        game_id: gameNum,
        canonical_game_id: gameId,
        canonical_clip_id: clipId,
        opponent: opponentRaw,
        opponent_slug: opponentSlug,
        location: fields.gameLocation || '',
        quarter: parseInt(fields.quarter, 10) || 1,
        possession: parseInt(fields.possession, 10) || 1,
        situation: fields.situation || '',
        formation: fields.offFormation || '',
        play_name: fields.playName || '',
        scout_coverage: fields.scoutTag || '',
        action_trigger: fields.actionTrigger || '',
        action_types: fields.actionTypes || '',
        action_sequence: fields.actionSeq || '',
        coverage: fields.coverage || '',
        ball_screen: fields.ballScreenCov || '',
        off_ball_screen: fields.offBallScreenCov || '',
        help_rotation: fields.helpRotation || '',
        disruption: fields.defDisruption || '',
        breakdown: fields.defBreakdown || '',
        result: fields.playResult || '',
        paint_touch: fields.paintTouches || '',
        shooter: fields.shooterDesignation || '',
        shot_location: fields.shotLocation || '',
        contest: fields.shotContest || '',
        rebound: fields.reboundOutcome || '',
        points: parseInt(fields.points, 10) || 0,
        has_shot: 'No',
        shot_x: '',
        shot_y: '',
        shot_result: '',
        notes: fields.notes || '',
        start_time: inTime,
        end_time: outTime,
      }

      // Save to API
      try {
        await adapterRef.current.saveClip(apiPayload as any)
        console.log('✅ Clip saved to database:', clipId)
      } catch (apiError) {
        console.error('⚠️ Failed to save clip to API:', apiError)
        alert(`Warning: Clip saved locally but failed to save to database.\n\n${apiError}`)
      }

      // Add to local queue
      setClips((prev) => [...prev, clipData])

      // Auto-increment Excel Row if active
      if (excelActive) {
        setExcelRow((prev) => prev + 1)
      }

      // Increment Possession #
      const newPossession = String((parseInt(fields.possession, 10) || 0) + 1)

      // Clear fields (keep Opponent, Quarter, Possession; reset Points to 0)
      setFields((prev) => ({
        ...prev,
        possession: newPossession,
        situation: '',
        offFormation: '',
        playName: '',
        scoutTag: '',
        actionTrigger: '',
        actionTypes: '',
        actionSeq: '',
        coverage: '',
        ballScreenCov: '',
        offBallScreenCov: '',
        helpRotation: '',
        defDisruption: '',
        defBreakdown: '',
        playResult: '',
        paintTouches: '',
        shooterDesignation: '',
        shotLocation: '',
        shotContest: '',
        reboundOutcome: '',
        points: '0',
        notes: '',
      }))

      // Clear IN/OUT
      setInTime('')
      setOutTime('')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleDrawer = () => {
    setDrawerOpen((prev) => !prev)
  }

  const handleSelectAll = (checked: boolean) => {
    setClips((prev) =>
      prev.map((c) => ({
        ...c,
        __selected: checked,
      }))
    )
  }

  const handleSelectClip = (index: number, checked: boolean) => {
    setClips((prev) =>
      prev.map((c, i) =>
        i === index
          ? {
              ...c,
              __selected: checked,
            }
          : c
      )
    )
  }

  const handleDeleteClip = (index: number) => {
    setClips((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSeekToClip = (timeStr: string) => {
    if (!videoRef.current) return
    const seconds = parseTime(timeStr)
    videoRef.current.currentTime = seconds
    videoRef.current.pause()
  }

  const handleExportCsv = () => {
    if (!clips.length) {
      alert('No clips to export.')
      return
    }

    const ORDER = [
      'Game #',
      'Location',
      'Opponent',
      'Quarter',
      'Possession #',
      'Situation',
      'Offensive Formation',
      'Play Name',
      'Covered in Scout?',
      'Action Trigger',
      'Action Type(s)',
      'Action Sequence',
      'Defensive Coverage',
      'Ball Screen Coverage',
      'Off-Ball Screen Coverage',
      'Help/Rotation',
      'Defensive Disruption',
      'Defensive Breakdown',
      'Play Result',
      'Paint Touches',
      'Shooter Designation',
      'Shot Location',
      'Shot Contest',
      'Rebound Outcome',
      'Points',
      'Notes',
      'Start Time',
      'End Time',
    ]

    const esc = (v: any) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    const rawHeader = ORDER.map((key) => esc(key)).join(',')
    const rawRows = clips.map((clip) => ORDER.map((key) => esc(clip[key as keyof QueueEntry] ?? '')))
    const rawCsv = [rawHeader, ...rawRows.map((row) => row.join(','))].join('\r\n')

    const opp = fields.opponent.trim() || 'Opponent'
    const game = fields.gameNum.trim() || 'Game'
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const rawName = `Tagging_raw_${opp}_${game}_${stamp}.csv`.replace(/\s+/g, '_')

    const blob = new Blob(['\ufeff' + rawCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = rawName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    alert('Exported CSV file.')
  }

  const handleAddToDashboard = () => {
    // Clips are automatically saved to the database via API, so they'll appear in the dashboard
    const count = clips.filter((c) => c.__selected !== false).length
    if (count === 0) {
      alert('No clips selected. Select clips from the queue first.')
      return
    }
    alert(`${count} clip${count > 1 ? 's' : ''} already saved to the database. They will appear in the Dashboard.`)
  }

  const handleToggleExcel = () => {
    setExcelActive((prev) => !prev)
  }

  const selectedCount = clips.filter((c) => c.__selected !== false).length

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoFileChange}
        className="hidden"
      />

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
        <div
          className="grid mx-auto"
          style={{
            gridTemplateAreas: '"video pbp" "controls pbp" "tags tags"',
            gridTemplateColumns: '1fr 370px',
            gridTemplateRows: 'auto minmax(36px, auto) auto',
            columnGap: '16px',
            rowGap: '12px',
            minHeight: 'calc(100vh - 64px)',
            paddingBottom: '32px',
            maxWidth: 'calc(100vw - 80px)',
            width: '100%',
          }}
        >
          {/* Video Pane */}
          <section
            className="panel relative flex min-h-0 flex-col self-stretch rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={{
              gridArea: 'video',
              height: 'clamp(300px, calc(100vh - 240px), 560px)',
              maxHeight: 'clamp(300px, calc(100vh - 240px), 560px)',
            }}
          >
            <VideoPane videoSrc={videoSrc} onVideoLoaded={handleVideoLoaded} />
          </section>

          {/* Controls Bar */}
          <section style={{ gridArea: 'controls', transform: 'translateY(-8px)', zIndex: 10, position: 'relative' }}>
            <ControlsBar
              videoRef={videoRef.current}
              inTime={inTime}
              outTime={outTime}
              excelRow={excelRow}
              onLoadVideo={handleLoadVideo}
              onMarkIn={handleMarkIn}
              onMarkOut={handleMarkOut}
              onSave={handleSave}
              onInTimeChange={setInTime}
              onOutTimeChange={setOutTime}
              onExcelRowChange={setExcelRow}
            />
          </section>

          {/* PBP Pane */}
          <aside
            className="panel relative flex flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={{
              gridArea: 'pbp',
              height: 'calc(clamp(300px, calc(100vh - 240px), 560px) + 56px)',
              maxHeight: 'calc(clamp(300px, calc(100vh - 240px), 560px) + 56px)',
            }}
          >
            <PbpPane opponent={fields.opponent} />
          </aside>

          {/* Tags Pane */}
          <section
            key="tags-pane-v2"
            className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={{ gridArea: 'tags', transform: 'translateY(-16px)', zIndex: 10, position: 'relative', padding: 0, overflow: 'hidden', maxHeight: '80px' }}
          >
            <TagsPane fields={fields} onChange={handleFieldChange} />
          </section>
        </div>
      </main>

      {/* Queue Drawer */}
      <QueueDrawer
        isOpen={drawerOpen}
        clips={clips}
        selectedCount={selectedCount}
        videoRef={videoRef.current}
        onToggle={handleToggleDrawer}
        onSelectAll={handleSelectAll}
        onSelectClip={handleSelectClip}
        onDeleteClip={handleDeleteClip}
        onSeekToClip={handleSeekToClip}
        onExportCsv={handleExportCsv}
        onAddToDashboard={handleAddToDashboard}
        excelActive={excelActive}
        onToggleExcel={handleToggleExcel}
      />
    </div>
  )
}

export default ReactTaggerNative
