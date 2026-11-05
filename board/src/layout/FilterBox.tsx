import { FilterIcon, QuestionIcon, XIcon } from '@primer/octicons-react'
import { combineFilters } from '../lib/filter'
import { navigate, type Route } from '../lib/router'
import { Dropdown } from '../ui/Dropdown'
import type { ViewConfig } from '../views/config'

const EXAMPLES: { text: string; meaning: string }[] = [
  { text: 'assignee:@me', meaning: 'assigned to you' },
  { text: 'status:"In Progress"', meaning: 'quotes for values with spaces' },
  { text: 'subteam:"Braking System"', meaning: 'one subteam' },
  { text: 'label:urgent', meaning: 'has a label' },
  { text: 'priority:"Critical path"', meaning: 'any field works: size:M, difficulty:D2…' },
  { text: '-status:Done', meaning: 'a minus means "not"' },
  { text: 'status:Todo,Blocked', meaning: 'a comma means "either"' },
  { text: 'no:assignee', meaning: 'empty field (has: for not empty)' },
  { text: 'is:archived', meaning: 'show archived items' },
]

/** The filter box. Its text lives in the URL (?q=), so a filtered view can be shared as a link. */
export function FilterBox({ route, view }: { route: Route; view: ViewConfig }) {
  const set = (q: string) => navigate({ q }, { replace: true })

  return (
    <div className="hdr-filter">
      {view.filter && (
        <span className="hdr-viewfilter" title="This view's own filter, applied as well as yours">
          View: {view.filter}
        </span>
      )}
      <div className="hdr-filter-box">
        <FilterIcon className="hdr-filter-icon" />
        <input
          className="input hdr-filter-input"
          type="text"
          value={route.q}
          placeholder="Filter by keyword or by field"
          aria-label="Filter items"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => set(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && route.q) {
              event.preventDefault()
              set('')
            }
          }}
        />
        {route.q && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm hdr-filter-clear" aria-label="Clear filter" onClick={() => set('')}>
            <XIcon />
          </button>
        )}
        <Dropdown label={<QuestionIcon />} ariaLabel="Filter help" buttonClassName="btn btn-ghost btn-icon btn-sm" align="right" width={340}>
          {(close) => (
            <div className="hdr-help">
              <p className="menu-heading">Click an example to add it</p>
              {EXAMPLES.map((example) => (
                <button
                  key={example.text}
                  type="button"
                  className="menu-item hdr-help-item"
                  onClick={() => {
                    set(combineFilters(route.q, example.text))
                    close()
                  }}
                >
                  <code>{example.text}</code>
                  <span className="muted">{example.meaning}</span>
                </button>
              ))}
              <p className="hdr-help-note muted">Any other words search titles and descriptions; #12 finds item 12.</p>
            </div>
          )}
        </Dropdown>
      </div>
    </div>
  )
}
