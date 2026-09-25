import { useState } from 'react'
import type { RegionPickerDialogProps } from '@/features/regions/RegionPickerDialog'
import { useRegionChoice } from '@/features/regions/useRegionChoice'

/**
 * The dialog that chooses which region the list is about — the shared region picker (drill down province › district › tehsil, or search), any level. `onChoose` is called with the
 * chosen region's id when confirmed. Spread `dialogProps` into a `RegionPickerDialog`; `open` is what the "change region" button calls.
 */
export function useScopePicker({ onChoose }: { onChoose: (regionId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const choice = useRegionChoice(isOpen)

  const dialogProps: RegionPickerDialogProps = {
    open: isOpen,
    onOpenChange: setIsOpen,
    title: 'Choose a region',
    description: "Pick a province, district or tehsil — the list then shows the places inside it. Use the arrow beside a region to see what's inside it.",
    confirmLabel: 'Show this region',
    state: choice.state,
    error: choice.error,
    onRetry: choice.retry,
    picker: choice.pickerProps,
    hasSelection: choice.selected !== null,
    onConfirm: () => {
      if (!choice.selected) return
      onChoose(choice.selected.id)
      setIsOpen(false)
    },
    isSubmitting: false,
    serverError: null,
  }

  return {
    open: () => {
      choice.reset()
      setIsOpen(true)
    },
    dialogProps,
  }
}
