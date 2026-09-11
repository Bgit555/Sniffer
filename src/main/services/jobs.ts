import { asc, desc, eq } from 'drizzle-orm'
import { getDb, lastInsertRowid } from '../db'
import { jobs } from '../db/schema'
import type { JobView } from '@shared/types'
import { broadcast } from '../events/bus'

const now = () => Date.now()

type JobStatus = 'pending' | 'running' | 'completed' | 'failed'
export type ProgressFn = (progress: number, label?: string) => void
export type JobHandler = (payload: unknown, onProgress: ProgressFn) => Promise<void>

const handlers = new Map<string, JobHandler>()
let pumping = false

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler)
}

function toView(row: typeof jobs.$inferSelect): JobView {
  return {
    id: row.id,
    type: row.type,
    status: row.status as JobStatus,
    progress: row.progress ?? 0,
    error: row.error,
    createdAt: row.createdAt ?? 0,
    completedAt: row.completedAt ?? null
  }
}

async function publish(id: number): Promise<void> {
  const db = getDb()
  const row = await db.select().from(jobs).where(eq(jobs.id, id)).get()
  if (row) broadcast('jobs:progress', toView(row))
}

export async function enqueue(type: string, payload: unknown): Promise<number> {
  const db = getDb()
  await db
    .insert(jobs)
    .values({ type, status: 'pending', payload: JSON.stringify(payload), progress: 0, attempts: 0, createdAt: now() })
    .run()
  const id = lastInsertRowid()
  void pumpQueue()
  return id
}

export async function listJobs(limit = 20): Promise<JobView[]> {
  const db = getDb()
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit).all()
  return rows.map(toView)
}

export async function resumePendingJobs(): Promise<void> {
  await pumpQueue()
}

async function pumpQueue(): Promise<void> {
  if (pumping) return
  pumping = true
  const db = getDb()
  try {
    for (;;) {
      const next = await db
        .select()
        .from(jobs)
        .where(eq(jobs.status, 'pending'))
        .orderBy(asc(jobs.id))
        .limit(1)
        .all()
      const job = next[0]
      if (!job) break

      const handler = handlers.get(job.type)
      if (!handler) {
        await db
          .update(jobs)
          .set({ status: 'failed', error: `No handler for job type "${job.type}"`, completedAt: now() })
          .where(eq(jobs.id, job.id))
          .run()
        await publish(job.id)
        continue
      }

      await db
        .update(jobs)
        .set({ status: 'running', startedAt: now(), attempts: (job.attempts ?? 0) + 1 })
        .where(eq(jobs.id, job.id))
        .run()

      const onProgress: ProgressFn = (progress, label) => {
        void updateProgress(job.id, progress, label)
      }

      try {
        const payload = job.payload ? JSON.parse(job.payload) : undefined
        await handler(payload, onProgress)
        await db
          .update(jobs)
          .set({ status: 'completed', progress: 100, completedAt: now() })
          .where(eq(jobs.id, job.id))
          .run()
        await publish(job.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await db
          .update(jobs)
          .set({ status: 'failed', error: message, completedAt: now() })
          .where(eq(jobs.id, job.id))
          .run()
        await publish(job.id)
      }
    }
  } finally {
    pumping = false
  }
}

async function updateProgress(id: number, progress: number, _label?: string): Promise<void> {
  const db = getDb()
  await db.update(jobs).set({ progress: Math.round(progress) }).where(eq(jobs.id, id)).run()
  await publish(id)
}
