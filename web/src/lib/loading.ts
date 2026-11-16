/** A debouncer with one pending timer per key, so an event on one table never cancels another table's reload. */
export function makeKeyedDebouncer(delayMs: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const later = (key: string, fn: () => void) => {
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      fn()
    }, delayMs))
  }
  later.cancelAll = () => {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
  }
  return later
}

type Page<T> = { data: T[] | null; error: { message: string } | null }

/** Reads every page (the API returns at most `size` rows per request); throws the first error. */
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, size = 1000): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < size) return rows
  }
}
