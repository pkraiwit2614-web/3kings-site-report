export type PagedReadPage<T> = {
  data: T[] | null
  error: unknown
  count: number | null
}

export type PagedReadResult<T> = {
  label: string
  data: T[]
  count: number
  loaded: number
  truncated: boolean
  pages: number
}

type PagedReadOptions<T> = {
  label: string
  pageSize?: number
  signal?: AbortSignal
  fetchPage: (from: number, to: number) => PromiseLike<PagedReadPage<T>>
  keyOf?: (row: T) => string
}

function abortError() {
  const error = new Error('Paged read aborted')
  error.name = 'AbortError'
  return error
}

export async function readAllPages<T>({
  label,
  pageSize = 500,
  signal,
  fetchPage,
  keyOf,
}: PagedReadOptions<T>): Promise<PagedReadResult<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('pageSize must be a positive integer')

  const data: T[] = []
  const seen = keyOf ? new Set<string>() : null
  let expectedCount: number | null = null
  let pages = 0

  while (true) {
    if (signal?.aborted) throw abortError()

    const from = data.length
    const page = await fetchPage(from, from + pageSize - 1)
    pages += 1

    if (page.error) throw page.error
    if (signal?.aborted) throw abortError()

    if (typeof page.count === 'number') {
      if (expectedCount === null) expectedCount = page.count
      else if (page.count !== expectedCount) {
        throw new Error(`PAGED_READ_COUNT_CHANGED:${label}:${expectedCount}->${page.count}`)
      }
    }

    const rows = page.data || []
    if (seen) {
      for (const row of rows) {
        const key = keyOf!(row)
        if (seen.has(key)) throw new Error(`PAGED_READ_DUPLICATE_KEY:${label}:${key}`)
        seen.add(key)
      }
    }
    data.push(...rows)

    if (expectedCount !== null && data.length >= expectedCount) break
    if (rows.length === 0) break
  }

  const count = expectedCount ?? data.length
  return {label, data, count, loaded: data.length, truncated: data.length < count, pages}
}

export function requireCompletePagedReads(results: ReadonlyArray<PagedReadResult<unknown>>) {
  const truncated = results.find(result => result.truncated)
  if (truncated) {
    throw new Error(`PAGED_READ_TRUNCATED:${truncated.label}:${truncated.loaded}/${truncated.count}`)
  }
}
