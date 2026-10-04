export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DISABLE_JOBS !== '1') {
    const { startJobs } = await import('./lib/jobs.ts')
    startJobs()
  }
}
