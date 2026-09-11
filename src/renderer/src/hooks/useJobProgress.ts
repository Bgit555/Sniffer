import { useEffect, useState } from 'react'
import type { JobView } from '@shared/types'
import { api, subscribe } from '../lib/api'

/**
 * Live view of running background jobs (export / bulk analysis). Hydrated from
 * `jobs:list`, then updated from main-process `jobs:progress` events.
 */
export function useJobProgress(): { jobs: JobView[]; refresh: () => void } {
  const [jobs, setJobs] = useState<JobView[]>([])

  const refresh = (): void => {
    api.jobs().then(setJobs).catch(() => setJobs([]))
  }

  useEffect(() => {
    refresh()
    return subscribe<JobView>('jobs:progress', (job) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id)
        if (idx === -1) return [job, ...prev]
        const next = [...prev]
        next[idx] = job
        return next
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { jobs: jobs.filter((j) => j.status === 'pending' || j.status === 'running' || (j.status === 'failed' && j.progress < 100)), refresh }
}
