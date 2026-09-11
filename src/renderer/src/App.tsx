import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListView } from '@shared/types'
import { api, subscribe, type ExportDone, type SearchOutcome } from './lib/api'
import { AppCtx, type Route, type Toast } from './lib/app-context'
import Home from './pages/Home'
import Results from './pages/Results'
import Company from './pages/Company'
import Lists from './pages/Lists'
import Connect from './pages/Connect'
import Autopilot from './pages/Autopilot'
import PromptLibrary from './pages/PromptLibrary'
import SavedSearches from './pages/SavedSearches'
import Outreach from './pages/Outreach'
import Settings from './pages/Settings'

const NAV_ITEMS: { name: 'home' | 'lists' | 'connect' | 'autopilot' | 'prompts' | 'saved' | 'outreach' | 'settings'; label: string; icon: string }[] = [
  { name: 'home', label: 'Search', icon: '⌕' },
  { name: 'lists', label: 'Lists', icon: '▤' },
  { name: 'connect', label: 'Connect', icon: '⛁' },
  { name: 'autopilot', label: 'Autopilot', icon: '⚡' },
  { name: 'prompts', label: 'Prompts', icon: '✦' },
  { name: 'saved', label: 'Saved', icon: '↻' },
  { name: 'outreach', label: 'Outreach', icon: '✉' },
  { name: 'settings', label: 'Settings', icon: '⚙' }
]

let toastId = 0

export default function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [lists, setLists] = useState<ListView[]>([])
  const [listVersion, setListVersion] = useState(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const notify = useCallback(
    (kind: Toast['kind'], message: string, action?: Toast['action']) => {
      const id = ++toastId
      setToasts((t) => [...t.slice(-3), { id, kind, message, action }])
      timers.current.set(
        id,
        setTimeout(() => removeToast(id), kind === 'error' ? 9000 : 5000)
      )
    },
    [removeToast]
  )

  const refreshLists = useCallback(() => setListVersion((v) => v + 1), [])

  useEffect(() => {
    api.lists().then(setLists).catch(() => setLists([]))
  }, [listVersion])

  const go = useCallback((r: Route) => setRoute(r), [])
  const openCompany = useCallback((id: number) => setRoute({ name: 'company', id }), [])
  const openSearchResults = useCallback(
    (query: string, outcome: SearchOutcome) => setRoute({ name: 'results', query, outcome }),
    []
  )

  // Global events: exports finishing in the background.
  useEffect(() => {
    const offExport = subscribe<ExportDone>('export:done', (r) => {
      notify('success', `Exported ${r.count} prospect${r.count === 1 ? '' : 's'} to CSV.`, {
        label: 'Show in folder',
        onClick: () => void api.revealPath(r.filePath)
      })
    })
    return offExport
  }, [notify])

  const page = (() => {
    switch (route.name) {
      case 'home':
        return <Home />
      case 'results':
        return <Results query={route.query} outcome={route.outcome} />
      case 'company':
        return <Company id={route.id} />
      case 'lists':
        return <Lists />
      case 'list':
        return <ListDetail id={route.id} key={route.id} />
      case 'connect':
        return <Connect />
      case 'autopilot':
        return <Autopilot />
      case 'prompts':
        return <PromptLibrary />
      case 'saved':
        return <SavedSearches />
      case 'outreach':
        return <Outreach />
      case 'settings':
        return <Settings />
    }
  })()

  const activeSection =
    route.name === 'company' || route.name === 'results' || route.name === 'list' ? 'home' : route.name

  return (
    <AppCtx.Provider value={{ nav: { route, go, openCompany, openSearchResults }, notify, refreshLists, listVersion, recentLists: lists, setRecentLists: setLists }}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <span className="mark">◈</span>
            <span>Sniffer</span>
          </div>
          <nav className="nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.name}
                className={`nav-item ${activeSection === item.name ? 'active' : ''}`}
                onClick={() => go({ name: item.name } as Route)}
              >
                <span className="icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="footer">
            {lists.length > 0 ? `${lists.reduce((n, l) => n + l.memberCount, 0)} prospects saved` : 'Local workspace'}
          </div>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <span className="title">{topbarTitle(route)}</span>
            {lists.length > 0 && (
              <span className="muted">{lists.length} list{lists.length === 1 ? '' : 's'}</span>
            )}
          </header>
          <div className="content">{page}</div>
        </main>

        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
              <div>{t.message}</div>
              {t.action && (
                <div className="actions">
                  <button onClick={() => { t.action!.onClick(); removeToast(t.id) }}>{t.action.label}</button>
                  <button onClick={() => removeToast(t.id)}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppCtx.Provider>
  )
}

function topbarTitle(route: Route): string {
  switch (route.name) {
    case 'home':
      return 'Find prospects'
    case 'results':
      return 'Search results'
    case 'company':
      return 'Company'
    case 'lists':
      return 'Lists'
    case 'list':
      return 'List'
    case 'connect':
      return 'Connect apps'
    case 'autopilot':
      return 'Autopilot'
    case 'prompts':
      return 'Prompt library'
    case 'saved':
      return 'Saved searches'
    case 'outreach':
      return 'Outreach'
    case 'settings':
      return 'Settings'
  }
}

// List detail lives alongside to keep file count low but mount fresh per list.
import ListDetail from './pages/ListDetail'
