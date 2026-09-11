import { and, asc, desc, eq } from 'drizzle-orm'
import { getDb, lastInsertRowid } from '../db'
import { listMembers, lists } from '../db/schema'
import type { CompanyView, ListView } from '@shared/types'
import { getCompanyViews } from './companyRepo'

const now = () => Date.now()

export async function createList(name: string, description?: string): Promise<ListView> {
  const db = getDb()
  const t = now()
  await db.insert(lists).values({ name, description: description ?? null, createdAt: t, updatedAt: t }).run()
  const id = lastInsertRowid()
  return { id, name, description: description ?? null, memberCount: 0, createdAt: t, updatedAt: t }
}

export async function renameList(id: number, name: string): Promise<void> {
  const db = getDb()
  await db.update(lists).set({ name, updatedAt: now() }).where(eq(lists.id, id)).run()
}

export async function deleteList(id: number): Promise<void> {
  const db = getDb()
  await db.delete(listMembers).where(eq(listMembers.listId, id)).run()
  await db.delete(lists).where(eq(lists.id, id)).run()
}

export async function listAll(): Promise<ListView[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: lists.id,
      name: lists.name,
      description: lists.description,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt
    })
    .from(lists)
    .orderBy(asc(lists.createdAt))
    .all()

  const members = await db.select({ listId: listMembers.listId, companyId: listMembers.companyId }).from(listMembers).all()
  const counts = new Map<number, number>()
  for (const m of members) counts.set(m.listId, (counts.get(m.listId) ?? 0) + 1)

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    memberCount: counts.get(r.id) ?? 0,
    createdAt: r.createdAt ?? 0,
    updatedAt: r.updatedAt ?? 0
  }))
}

export async function addCompanyToList(listId: number, companyId: number): Promise<boolean> {
  const db = getDb()
  const existing = await db
    .select({ id: listMembers.id })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.companyId, companyId)))
    .get()
  if (existing) return false
  await db.insert(listMembers).values({ listId, companyId, addedAt: now() }).run()
  await db.update(lists).set({ updatedAt: now() }).where(eq(lists.id, listId)).run()
  return true
}

export async function addCompaniesToList(listId: number, companyIds: number[]): Promise<number> {
  let added = 0
  for (const id of companyIds) {
    if (await addCompanyToList(listId, id)) added++
  }
  return added
}

export async function removeCompanyFromList(listId: number, companyId: number): Promise<void> {
  const db = getDb()
  await db.delete(listMembers).where(and(eq(listMembers.listId, listId), eq(listMembers.companyId, companyId))).run()
  await db.update(lists).set({ updatedAt: now() }).where(eq(lists.id, listId)).run()
}

export async function listCompanies(listId: number): Promise<CompanyView[]> {
  const db = getDb()
  const members = await db
    .select({ companyId: listMembers.companyId })
    .from(listMembers)
    .where(eq(listMembers.listId, listId))
    .orderBy(desc(listMembers.addedAt))
    .all()
  const ids = members.map((m) => m.companyId)
  return getCompanyViews(ids)
}

export async function companyListIds(companyId: number): Promise<number[]> {
  const db = getDb()
  const rows = await db.select({ listId: listMembers.listId }).from(listMembers).where(eq(listMembers.companyId, companyId)).all()
  return rows.map((r) => r.listId)
}

export async function getListName(id: number): Promise<string | null> {
  const db = getDb()
  const row = await db.select({ name: lists.name }).from(lists).where(eq(lists.id, id)).get()
  return row?.name ?? null
}

export async function savedCompanyIds(listId: number): Promise<number[]> {
  const db = getDb()
  const rows = await db.select({ companyId: listMembers.companyId }).from(listMembers).where(eq(listMembers.listId, listId)).all()
  return rows.map((r) => r.companyId)
}
