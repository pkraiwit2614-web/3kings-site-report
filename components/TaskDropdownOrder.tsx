'use client'

import { useEffect } from 'react'

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const taskPrefix = /^\s*(\d+(?:\.\d+)*)\s*[.)-]?\s+/

function taskNumber(option: HTMLOptionElement) {
  return (option.textContent || '').match(taskPrefix)?.[1] || ''
}

function sortTaskSelect(select: HTMLSelectElement) {
  const options = Array.from(select.options)
  const numbered = options.filter(option => option.value && taskNumber(option))
  if (numbered.length < 2) return

  const placeholders = options.filter(option => !option.value)
  const unnumbered = options.filter(option => option.value && !taskNumber(option))
  const sorted = numbered.slice().sort((a, b) => {
    const byNumber = collator.compare(taskNumber(a), taskNumber(b))
    if (byNumber !== 0) return byNumber
    return (a.textContent || '').localeCompare(b.textContent || '', 'th', { numeric: true, sensitivity: 'base' })
  })
  const desired = [...placeholders, ...sorted, ...unnumbered]

  if (desired.every((option, index) => options[index] === option)) return
  desired.forEach(option => select.appendChild(option))
}

function sortAllTaskSelects() {
  document.querySelectorAll<HTMLSelectElement>('select').forEach(sortTaskSelect)
}

export default function TaskDropdownOrder() {
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sortAllTaskSelects)
    }

    sortAllTaskSelects()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return null
}
