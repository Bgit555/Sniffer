import { useEffect, useState } from 'react'
import type { ListView } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'

interface Props {
  companyIds: number[]
  onDone?: () => void
}

/** Expandable "Save to list" control (used on results and company views). */
export default function SaveToList({ companyIds, onDone }: Props): React.JSX.Element {
  const { notify, refreshLists } = useApp()
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState<ListView[]>([])
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (open) api.lists().then(setLists).catch(() => setLists([]))
  }, [open])

  async function addToList(listId: number): Promise<void> {
    setBusy(true)
    try {
      const added = await api.addCompaniesToList(listId, companyIds)
      const name = lists.find((l) => l.id === listId)?.name ?? 'list'
      notify('success', added > 0 ? `Added ${added} prospect${added === 1 ? '' : 's'} to ${name}.` : 'Already in that list.')
      setOpen(false)
      refreshLists()
      onDone?.()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to save to list.')
    } finally {
      setBusy(false)
    }
  }

  async function createAndAdd(): Promise<void> {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const list = await api.createList(name, 'Created from search results')
      await api.addCompaniesToList(list.id, companyIds)
      notify('success', `Created "${name}" and added ${companyIds.length} prospect${companyIds.length === 1 ? '' : 's'}.`)
      setOpen(false)
      setNewName('')
      refreshLists()
      onDone?.()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to create list.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <button className="btn primary small" disabled={busy || companyIds.length === 0} onClick={() => setOpen((o) => !o)}>
        {open ? 'Close' : companyIds.length > 1 ? `Save ${companyIds.length} to list` : 'Save to list'}
      </button>
      {open && (
        <div className="section" style={{ marginTop: 10, minWidth: 280 }}>
          {lists.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No lists yet — create one below.</p>}
          {lists.map((l) => (
            <div className="list-row" key={l.id}>
              <div>
                <div style={{ fontWeight: 600 }}>{l.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{l.memberCount} prospects</div>
              </div>
              <button className="btn small" disabled={busy} onClick={() => void addToList(l.id)}>
                Add
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              placeholder="New list name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createAndAdd()}
            />
            <button className="btn primary small" disabled={creating || !newName.trim()} onClick={() => void createAndAdd()}>
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
