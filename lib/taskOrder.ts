type TaskNumberLike = {
  source_task_no?: string | null
  task_name?: string | null
}

const taskNumberCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

export function compareTaskNumber(a: TaskNumberLike, b: TaskNumberLike) {
  const aNo = String(a.source_task_no || '').trim()
  const bNo = String(b.source_task_no || '').trim()

  if (aNo && !bNo) return -1
  if (!aNo && bNo) return 1

  if (aNo && bNo) {
    const byNumber = taskNumberCollator.compare(aNo, bNo)
    if (byNumber !== 0) return byNumber
  }

  return String(a.task_name || '').localeCompare(String(b.task_name || ''), 'th', {
    numeric: true,
    sensitivity: 'base',
  })
}

export function sortTasksByNumber<T extends TaskNumberLike>(tasks: T[]) {
  return tasks.slice().sort(compareTaskNumber)
}
