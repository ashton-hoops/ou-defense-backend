import { useEffect, useMemo, useState } from 'react'
import ReactClipDetail from './components/ReactClipDetail'
import ReactClipsPanel from './components/ReactClipsPanel'
import ReactDashboard from './components/ReactDashboard'
import ReactGameDetail from './components/ReactGameDetail'
import ReactTaggerNative from './components/ReactTaggerNative'
import type { DataMode } from './lib/data'
import { toClipSummary, type ClipSummary } from './lib/data/transformers'
import type { Clip } from './lib/types'

type TabKey =
  | 'tagger'
  | 'react-clips'
  | 'react-tagger-native'
  | 'react-detail'
  | 'react-dashboard'
  | 'react-game'
  | 'dashboard'
  | 'detail'
  | 'extractor'

interface TabConfig {
  key: TabKey
  label: string
  hash: `#/${string}`
  description: string
  src?: string
  showInNav?: boolean
}

const LEGACY_TAGGER_TAB: TabConfig = {
  key: 'tagger',
  label: 'Clip Tagger',
  hash: '#/tagger',
  src: '/legacy/clip_tagger_copy.html',
  description: 'Tag plays and manage OU defensive clips.',
}

const TABS: TabConfig[] = [
  LEGACY_TAGGER_TAB,
  {
    key: 'react-clips',
    label: 'Clips (React)',
    hash: '#/react-clips',
    description: 'React-native clip list powered by the data adapters.',
  },
  {
    key: 'react-dashboard',
    label: 'Dashboard (React)',
    hash: '#/react-dashboard',
    description: 'React-native defensive analytics dashboard.',
  },
  {
    key: 'react-game',
    label: 'Game Detail (React)',
    hash: '#/react-game',
    description: 'React-native per-game defensive summary.',
    showInNav: false,
  },
  {
    key: 'react-tagger-native',
    label: 'Clip Tagger (React)',
    hash: '#/react-tagger-native',
    description: 'Native React clip tagging interface.',
    showInNav: true,
  },
  {
    key: 'react-detail',
    label: 'Clip Detail (React)',
    hash: '#/react-detail',
    description: 'React-native clip detail viewer.',
    showInNav: false,
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    hash: '#/dashboard',
    src: '/legacy/clip_dashboard_refined.html',
    description: 'Review defensive analytics, filters, and charts.',
  },
  {
    key: 'detail',
    label: 'Clip Detail',
    hash: '#/detail',
    src: '/legacy/clip_detail2.html',
    description: 'Inspect individual clip metadata and notes.',
  },
  {
    key: 'extractor',
    label: 'Extractor',
    hash: '#/extractor',
    src: '/legacy/clip_extractor_placeholder.html',
    description: 'Interface to the Python clip extractor service.',
  },
]

const NAV_TABS = TABS.filter((tab) => tab.showInNav !== false)

type RouteState = {
  tab: TabKey
  clipId: string | null
  gameId: string | null
  hash: string
}

const DEFAULT_ROUTE: RouteState = {
  tab: 'tagger',
  clipId: null,
  gameId: null,
  hash: '#/tagger',
}

const DETAIL_PREFIX = '#/react-detail/'
const TAGGER_PREFIX = '#/react-tagger-native/'
const GAME_PREFIX = '#/react-game/'

const parseRoute = (rawHash: string | undefined | null): RouteState => {
  if (!rawHash || rawHash.length === 0) return DEFAULT_ROUTE
  const hash = rawHash.trim()
  if (!hash) return DEFAULT_ROUTE
  const lower = hash.toLowerCase()

  if (lower.startsWith(DETAIL_PREFIX)) {
    const idEncoded = hash.slice(DETAIL_PREFIX.length)
    const clipId = idEncoded ? decodeURIComponent(idEncoded) : null
    return {
      tab: 'react-detail',
      clipId,
      gameId: null,
      hash: clipId ? `#/react-detail/${encodeURIComponent(clipId)}` : '#/react-detail',
    }
  }

  if (lower.startsWith(TAGGER_PREFIX)) {
    const idEncoded = hash.slice(TAGGER_PREFIX.length)
    const clipId = idEncoded ? decodeURIComponent(idEncoded) : null
    return {
      tab: 'react-tagger-native',
      clipId,
      gameId: null,
      hash: clipId ? `#/react-tagger-native/${encodeURIComponent(clipId)}` : '#/react-tagger-native',
    }
  }

  if (lower.startsWith(GAME_PREFIX)) {
    const idEncoded = hash.slice(GAME_PREFIX.length)
    const gameId = idEncoded ? decodeURIComponent(idEncoded) : null
    return {
      tab: 'react-game',
      clipId: null,
      gameId,
      hash: gameId ? `#/react-game/${encodeURIComponent(gameId)}` : '#/react-game',
    }
  }

  if (lower === '#/react-detail') {
    return { tab: 'react-detail', clipId: null, gameId: null, hash: '#/react-detail' }
  }
  if (lower === '#/react-tagger-native') {
    return { tab: 'react-tagger-native', clipId: null, gameId: null, hash: '#/react-tagger-native' }
  }

  const matched = TABS.find((tab) => tab.hash.toLowerCase() === lower)
  if (matched) {
    return { tab: matched.key, clipId: null, gameId: null, hash: matched.hash }
  }

  return DEFAULT_ROUTE
}

const deriveEnvName = () => {
  const explicit = import.meta.env.VITE_ENV_NAME as string | undefined
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim()
  }
  const mode = import.meta.env.MODE
  return mode ? mode.toString() : 'development'
}

function App() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.hash))
  const [dataMode, setDataMode] = useState<DataMode>('local')
  const [clipRefreshKey, setClipRefreshKey] = useState(0)
  const [selectedClipSummary, setSelectedClipSummary] = useState<ClipSummary | null>(null)

  const activeTab = route.tab
  const selectedClipId = route.clipId
  const selectedGameId = route.gameId

  const activeTabConfig = useMemo(
    () => TABS.find((tab) => tab.key === activeTab) ?? TABS[0],
    [activeTab],
  )

  const envName = useMemo(() => deriveEnvName(), [])

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseRoute(window.location.hash))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = DEFAULT_ROUTE.hash
      setRoute(DEFAULT_ROUTE)
    }
  }, [])

  useEffect(() => {
    document.title = `OU WOMEN'S BASKETBALL — ${activeTabConfig.label}`
  }, [activeTabConfig.label])

  const handleSelect = (tabKey: TabKey) => {
    const tab = TABS.find((item) => item.key === tabKey)
    if (!tab) return
    if (tab.hash === window.location.hash) return

    if (tabKey === 'react-detail') {
      if (!selectedClipId) {
        window.location.hash = LEGACY_TAGGER_TAB.hash
        alert('Select a clip from the legacy tagger or React list before opening the React detail view.')
        return
      }
      const encoded = encodeURIComponent(selectedClipId)
      window.location.hash = `#/react-detail/${encoded}`
      return
    }

    if (tabKey === 'react-tagger-native' && selectedClipId) {
      window.location.hash = `#/react-tagger-native/${encodeURIComponent(selectedClipId)}`
      return
    }

    window.location.hash = tab.hash
  }

  const handleOpenClip = (clipId: string, summary: ClipSummary) => {
    setSelectedClipSummary(summary)
    window.location.hash = `#/react-detail/${encodeURIComponent(clipId)}`
  }

  const navigateBackToList = () => {
    window.location.hash = '#/react-clips'
  }

  const navigateBackToDashboard = () => {
    window.location.hash = '#/react-dashboard'
  }

  const toggleDataMode = () => {
    setDataMode((mode) => (mode === 'local' ? 'cloud' : 'local'))
  }

  const handleClipUpdated = (updatedClip: Clip) => {
    setClipRefreshKey((value) => value + 1)
    setSelectedClipSummary(toClipSummary(updatedClip))
  }

  const handleSelectGame = (gameId: string) => {
    if (!gameId) return
    window.location.hash = `#/react-game/${encodeURIComponent(gameId)}`
  }

  const navActiveKey: TabKey =
    activeTab === 'react-detail'
      ? 'react-clips'
      : activeTab === 'react-game'
        ? 'react-dashboard'
        : activeTab

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-gradient-to-r from-black via-[#121212] to-[#1b1b1b]/90">
        <div className="flex w-full flex-col gap-6 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[0.7rem] uppercase tracking-[0.5em] text-white/45">
              OU Women&apos;s Basketball
            </span>
            <span className="text-xl font-semibold uppercase tracking-[0.18em] text-white">
              Defensive Analytics
            </span>
            <span className="text-xs uppercase tracking-[0.4em] text-white/55">
              2025–2026 Season
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {NAV_TABS.map((tab) => {
              const isActive = tab.key === navActiveKey
              const baseClasses =
                'rounded-full px-4 py-2 text-sm font-medium transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40'
              const activeClasses = 'bg-[#841617] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
              const inactiveClasses =
                'bg-white/10 text-white/75 hover:bg-white/20 hover:text-white'

              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-label={`Open ${tab.label}`}
                  onClick={() => handleSelect(tab.key)}
                  className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col bg-[#0a0a0a] min-h-0 overflow-hidden">
        <div className="flex flex-1 flex-col px-6 pb-0 min-h-0 overflow-hidden">
          <div className="relative flex-1 min-h-0">
            {TABS.map((tab) => {
              if (!tab.src) return null
              const isActive = tab.key === activeTab
              return (
                <iframe
                  key={tab.key}
                  title={tab.description}
                  src={tab.src}
                  className={`absolute inset-0 h-full w-full border-0 ${isActive ? 'block' : 'hidden'}`}
                  allowFullScreen
                />
              )
            })}
            {activeTab === 'react-clips' && (
              <ReactClipsPanel
                key="react-clips"
                dataMode={dataMode}
                onOpenClip={handleOpenClip}
                refreshKey={clipRefreshKey}
              />
            )}
            {activeTab === 'react-dashboard' && (
              <ReactDashboard key="react-dashboard" dataMode={dataMode} onSelectGame={handleSelectGame} />
            )}
            {activeTab === 'react-game' && (
              <ReactGameDetail
                key={`react-game-${selectedGameId ?? 'none'}`}
                dataMode={dataMode}
                gameId={selectedGameId}
                onBack={navigateBackToDashboard}
                onOpenClip={(clipId, clip) => handleOpenClip(clipId, toClipSummary(clip))}
              />
            )}
            {activeTab === 'react-detail' && (
              <ReactClipDetail
                key={`react-detail-${selectedClipId ?? 'none'}`}
                clipId={selectedClipId}
                dataMode={dataMode}
                onBack={navigateBackToList}
                onClipUpdated={handleClipUpdated}
                summary={selectedClipSummary ?? undefined}
              />
            )}
            {activeTab === 'react-tagger-native' && (
              <ReactTaggerNative key="react-tagger-native" />
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-[#101010] text-[0.75rem] text-white/70">
        <div className="flex w-full flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.28em] text-white/45">
              Active tab
            </span>
            <span className="text-sm font-medium text-white">
              {activeTabConfig.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2 text-white">
              <span className="relative flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400" />
              </span>
              Local hub running
            </span>

            <button
              type="button"
              onClick={toggleDataMode}
              className="flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white/16"
              title="Toggle between local SQLite API and future cloud stack"
            >
              <span className="rounded-sm bg-white/20 px-1.5 py-0.5 text-[0.65rem] font-medium">
                Data
              </span>
              {dataMode === 'local' ? 'Local' : 'Cloud'}
            </button>

            <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white">
              {envName}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
