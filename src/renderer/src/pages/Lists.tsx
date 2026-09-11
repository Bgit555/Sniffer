import { useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'

export default function Lists(): React.JSX.Element {
  const { nav, notify, recentLists, refreshLists } = useApp()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  async function create(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const list = await api.createList(trimmed)
      refreshLists()
      setName('')
      notify('success', `Created list "${list.name}".`)
      nav.go({ name: 'list', id: list.id })
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to create list.')
    } finally {
      setCreating(false)
    }
  }

  async function remove(id: number, listName: string): Promise<void> {
    if (!window.confirm(`Delete the list "${listName}"? Companies stay saved locally.`)) return
    try {
      await api.deleteList(id)
      refreshLists()
      notify('success', `Deleted "${listName}".`)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to delete list.')
    }
  }

  return (
    <div>
      <h2>Lists</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Organise the prospects you save. Every list is stored locally in Sniffer's SQLite database.
      </p>

      <div className="section" style={{ display: 'flex', gap: 10 }}>
        <input
          placeholder="New list name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
        />
        <button className="btn primary" disabled={creating || !name.trim()} onClick={() => void create()}>
          {creating ? 'Creating…' : 'Create list'}
        </button>
      </div>

      {recentLists.length === 0 ? (
        <div className="empty">
          No lists yet.
          <br />
          <span className="muted">Run a search, then save the best matches to a list.</span>
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 16 }}>
          {recentLists.map((l) => (
            <div className="card" key={l.id} onClick={() => nav.go({ name: 'list', id: l.id })}>
              <div className="company-name">
                <span style={{ flex: 1 }}>{l.name}</span>
                <span className="badge-score">{l.memberCount}</span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                {l.memberCount} prospect{l.memberCount === 1 ? '' : 's'} · updated {new Date(l.updatedAt).toLocaleDateString()}
              </div>
              <div className="row-actions" style={{ marginTop: 14 }}>
                <button
                  className="btn small primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    nav.go({ name: 'list', id: l.id })
                  }}
                >
                  Open
                </button>
                <button
                  className="btn small"
                  onClick={(e) => {
                    e.stopPropagation()
                    void remove(l.id, l.name)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
