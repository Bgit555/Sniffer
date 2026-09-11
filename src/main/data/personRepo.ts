import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { people } from '../db/schema'
import type { PersonView } from '@shared/types'

export async function getPerson(id: number): Promise<PersonView | null> {
  const db = getDb()
  const p = await db.select().from(people).where(eq(people.id, id)).get()
  if (!p) return null
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    title: p.title,
    email: p.email,
    emailStatus: p.emailStatus,
    linkedinUrl: p.linkedinUrl,
    location: p.location
  }
}
