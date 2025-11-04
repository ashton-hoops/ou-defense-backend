import { useEffect, useRef, useState } from 'react'

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
      const margin = 6
      const vh = window.innerHeight
      const spaceBelow = vh - rect.bottom - margin
      const spaceAbove = rect.top - margin

      const preferred = 110
      const minHeight = 95
      const buffer = 8

      const newDirection = spaceBelow >= spaceAbove - 20 ? 'below' : 'above'
      const avail = newDirection === 'below' ? spaceBelow - buffer : spaceAbove - buffer
      const h = Math.max(minHeight, Math.min(preferred, Math.max(0, avail)))

      setDirection(newDirection)
      setPosition({
        top: newDirection === 'below' ? rect.bottom + margin : rect.top - margin - h,
        left: rect.left,
        width: Math.max(220, rect.width),
        maxHeight: h,
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

  return (
    <div
      ref={pickerRef}
      className="fixed z-[9999] overflow-auto rounded-lg border border-[#24303b] bg-black shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {filteredOptions.length > 0 ? (
        filteredOptions.map((option, idx) => (
          <div
            key={idx}
            className="cursor-pointer whitespace-nowrap px-2.5 py-2 text-sm hover:bg-[#18222c]"
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
}
