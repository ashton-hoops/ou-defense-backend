import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type FloatingPickerProps = {
  inputRef: HTMLInputElement | null
  options: string[]
  isOpen: boolean
  onSelect: (value: string) => void
  onClose: () => void
}

export const FloatingPicker = ({
  inputRef,
  options,
  isOpen,
  onSelect,
  onClose,
}: FloatingPickerProps) => {
  const pickerRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 0 })
  const [direction, setDirection] = useState<'below' | 'above'>('below')

  const filteredOptions = options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()))

  useEffect(() => {
    if (!isOpen || !inputRef) return

    const updatePosition = () => {
      const rect = inputRef.getBoundingClientRect()
      const spaceAbove = rect.top

      // Calculate height based on number of items
      // Each item is ~36px (py-2 + text = ~36px), add some padding
      const itemHeight = 36
      const padding = 8
      const maxVisibleItems = 4 // Show max 4 items before scrolling
      const calculatedHeight = (filteredOptions.length * itemHeight) + padding
      const maxHeight = (maxVisibleItems * itemHeight) + padding

      // Use actual height for <=4 items, otherwise cap at 4 items height
      const dropdownHeight = Math.min(calculatedHeight, maxHeight, spaceAbove - 10)

      setDirection('above')
      setPosition({
        top: rect.top - dropdownHeight, // Position so bottom edge touches top of input
        left: rect.left,
        width: Math.max(220, rect.width),
        maxHeight: dropdownHeight,
      })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, inputRef])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target !== inputRef) return

      if (e.key === 'Enter') {
        const firstOption = filteredOptions[0]
        if (firstOption) {
          e.preventDefault()
          onSelect(firstOption)
        }
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, inputRef, filteredOptions, onSelect, onClose])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        e.target !== inputRef
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, inputRef, onClose])

  useEffect(() => {
    if (inputRef) {
      const currentValue = inputRef.value
      const lastToken = currentValue.split(',').slice(-1)[0].trim()
      setFilter(lastToken)
    }
  }, [inputRef?.value, isOpen])

  if (!isOpen) return null

  const handleWheel = (e: React.WheelEvent) => {
    // Prevent page scroll when scrolling inside dropdown
    e.stopPropagation()

    const target = e.currentTarget
    const isAtTop = target.scrollTop === 0
    const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight

    // Only prevent default if we're not at boundaries (to allow natural scroll feel)
    if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
      // Let the dropdown scroll naturally
    }
  }

  const pickerElement = (
    <div
      ref={pickerRef}
      className="fixed z-[9999] overflow-auto rounded-lg border border-[#3a3a3a] bg-[#1a1a1a] shadow-xl"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
      }}
      onMouseDown={(e) => e.preventDefault()}
      onWheel={handleWheel}
    >
      {filteredOptions.length > 0 ? (
        filteredOptions.map((option, idx) => (
          <div
            key={idx}
            className="cursor-pointer whitespace-nowrap px-2.5 py-2 text-sm text-[#faf9f6] hover:bg-[#18222c]"
            data-val={option}
            onClick={() => onSelect(option)}
          >
            {option}
          </div>
        ))
      ) : (
        <div className="px-2.5 py-2 text-xs text-slate-400">No matches</div>
      )}
    </div>
  )

  return createPortal(pickerElement, document.body)
}
