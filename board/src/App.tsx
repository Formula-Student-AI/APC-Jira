import { useEffect } from 'react'
import { LoginScreen } from './auth/LoginScreen'
import { APP_NAME, CONFIG_ERROR } from './config'
import { Header } from './layout/Header'
import { Toasts } from './layout/Toasts'
import { useRoute } from './lib/router'
import { ItemPanel } from './panel/ItemPanel'
import { bootstrapAuth, useAuth } from './store/auth'
import { loadBoard, startBoard, stopBoard, useBoard } from './store/board'
import { BoardView } from './views/board/BoardView'
import { VIEWS, viewById, type ViewConfig } from './views/config'
import { TableView } from './views/table/TableView'
import { TimelineView } from './views/timeline/TimelineView'

export function App() {
  const phase = useAuth((s) => s.phase)

  useEffect(() => {
    if (!CONFIG_ERROR) void bootstrapAuth()
  }, [])

  if (CONFIG_ERROR) return <FullPageMessage title="Not configured" message={CONFIG_ERROR} />
  if (phase === 'checking') return <FullPageMessage title={APP_NAME} message="Loading…" busy />
  if (phase === 'signed_out') return <LoginScreen />
  return <BoardShell />
}

function BoardShell() {
  const username = useAuth((s) => s.member?.username)
  const route = useRoute()
  const view = viewById(route.view) ?? VIEWS[0]
  const load = useBoard((s) => s.load)
  const loadError = useBoard((s) => s.loadError)

  // (Re)start the live board for the signed-in member; stop it on sign-out or user switch.
  useEffect(() => {
    if (!username) return
    startBoard()
    return () => stopBoard()
  }, [username])

  return (
    <div className="app">
      <Header route={route} />
      <main className="app-main" aria-label={view.name}>
        {load === 'ready' ? (
          <ViewSwitch view={view} query={route.q} />
        ) : load === 'error' ? (
          <div className="empty-state">
            <p>Couldn't load the board: {loadError}</p>
            <button type="button" className="btn" onClick={() => void loadBoard()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="spinner" aria-hidden="true" />
            <p>Loading the board…</p>
          </div>
        )}
      </main>
      {route.item !== null && load === 'ready' && <ItemPanel number={route.item} />}
      <Toasts />
    </div>
  )
}

function ViewSwitch({ view, query }: { view: ViewConfig; query: string }) {
  switch (view.layout) {
    case 'board':
      return <BoardView key={view.id} view={view} query={query} />
    case 'roadmap':
      return <TimelineView key={view.id} view={view} query={query} />
    case 'table':
      return <TableView key={view.id} view={view} query={query} />
  }
}

function FullPageMessage({ title, message, busy = false }: { title: string; message: string; busy?: boolean }) {
  return (
    <div className="full-page">
      <div className="full-page-card">
        <h1>{title}</h1>
        {busy && <div className="spinner" style={{ margin: '16px auto' }} aria-hidden="true" />}
        <p className="muted">{message}</p>
      </div>
    </div>
  )
}
