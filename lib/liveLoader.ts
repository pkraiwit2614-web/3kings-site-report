type LiveLoaderOptions = {
  load: (signal: AbortSignal) => Promise<void>
  onError: () => void
  onSettled?: () => void
  timeoutMs?: number
}

// One request batch per mounted page. Events during a batch request one trailing
// refresh, so an older response cannot overwrite a newer completed batch.
export function createLiveLoader({ load, onError, onSettled, timeoutMs = 15000 }: LiveLoaderOptions) {
  let stopped = false
  let running = false
  let pending = false
  let controller: AbortController | null = null

  const refresh = async (): Promise<void> => {
    if (stopped) return
    if (running) { pending = true; return }
    running = true
    controller = new AbortController()
    const current = controller
    const timer = setTimeout(() => current.abort(), timeoutMs)
    try {
      await load(current.signal)
    } catch {
      if (!stopped) onError()
    } finally {
      clearTimeout(timer)
      controller = null
      running = false
      if (!stopped) onSettled?.()
      if (pending && !stopped) {
        pending = false
        void refresh()
      }
    }
  }

  return {
    refresh,
    dispose() {
      stopped = true
      pending = false
      controller?.abort()
    },
  }
}

// Supabase normally resolves with { error }; Promise.all alone does not reject.
// Validate the entire batch before committing any state or freshness timestamp.
export function requireSuccessfulReads(results: ReadonlyArray<{ error: unknown }>) {
  const failed = results.find(result => result.error)
  if (failed) throw failed.error
}
