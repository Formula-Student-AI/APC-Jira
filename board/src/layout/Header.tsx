// Header: brand, the five view tabs, the filter box, "+ New item", live status and the user menu.

import { PlusIcon, ProjectIcon, ProjectRoadmapIcon, TableIcon } from '@primer/octicons-react'
import { useState } from 'react'
import { ORG_NAME, PLAN_LABEL } from '../config'
import { navigate, type Route } from '../lib/router'
import { VIEWS, viewById, type ViewConfig } from '../views/config'
import { FilterBox } from './FilterBox'
import { LiveIndicator } from './LiveIndicator'
import { NewItemDialog } from './NewItemDialog'
import { UserMenu } from './UserMenu'
import './layout.css'

const VIEW_ICONS: Record<ViewConfig['layout'], typeof ProjectIcon> = {
  board: ProjectIcon,
  roadmap: ProjectRoadmapIcon,
  table: TableIcon,
}

export function Header({ route }: { route: Route }) {
  const [creating, setCreating] = useState(false)
  const view = viewById(route.view) ?? VIEWS[0]

  return (
    <header className="hdr">
      <div className="hdr-top">
        <div className="hdr-brand">
          <span className="hdr-logo" aria-hidden="true">
            FS
          </span>
          <span className="hdr-title">
            {ORG_NAME} · {PLAN_LABEL}
          </span>
        </div>
        <div className="hdr-actions">
          <LiveIndicator />
          <button type="button" className="btn btn-primary hdr-new" aria-label="New item" onClick={() => setCreating(true)}>
            <PlusIcon />
            <span className="hdr-new-label">New item</span>
          </button>
          <UserMenu />
        </div>
      </div>
      <div className="hdr-bar">
        <nav className="hdr-tabs" aria-label="Views">
          {VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v.layout]
            const active = v.id === view.id
            return (
              <button
                key={v.id}
                type="button"
                className={`hdr-tab${active ? ' hdr-tab-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate({ view: v.id })}
              >
                <Icon size={16} />
                <span>{v.name}</span>
              </button>
            )
          })}
        </nav>
        <FilterBox route={route} view={view} />
      </div>
      {creating && <NewItemDialog route={route} view={view} onClose={() => setCreating(false)} />}
    </header>
  )
}
