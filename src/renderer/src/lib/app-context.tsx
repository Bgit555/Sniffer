import { createContext, useContext } from 'react'
import type { CompanyView, ListView, OutreachView, SearchSpec } from '@shared/types'
import type { SearchOutcome } from './api'

export type Route =
  | { name: 'home' }
  | { name: 'results'; query: string; outcome: SearchOutcome; fromListId?: number }
  | { name: 'company'; id: number }
  | { name: 'lists' }
  | { name: 'list'; id: number }
  | { name: 'connect' }
  | { name: 'autopilot' }
  | { name: 'prompts' }
  | { name: 'saved' }
  | { name: 'outreach' }
  | { name: 'settings' }

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  message: string
  action?: { label: string; onClick: () => void }
}

export interface Nav {
  route: Route
  go: (r: Route) => void
  openCompany: (id: number) => void
  openSearchResults: (query: string, outcome: SearchOutcome) => void
}

export interface AppApi {
  nav: Nav
  notify: (kind: Toast['kind'], message: string, action?: Toast['action']) => void
  refreshLists: () => void
  listVersion: number
  recentLists: ListView[]
  setRecentLists: (l: ListView[]) => void
}

export const AppCtx = createContext<AppApi | null>(null)

export function useApp(): AppApi {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside AppCtx.Provider')
  return ctx
}

export type { CompanyView, ListView, OutreachView, SearchSpec }
