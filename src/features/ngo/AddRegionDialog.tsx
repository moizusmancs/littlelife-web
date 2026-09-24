import { RegionPickerDialog, type RegionPickerDialogProps } from '@/features/regions/RegionPickerDialog'

export type AddRegionDialogProps = Omit<RegionPickerDialogProps, 'title' | 'description' | 'confirmLabel'>

/**
 * Adds one region to the organisation's operational coverage: the shared region-picker dialog with
 * this screen's wording. A region already covered stays listed but can't be picked again, so nobody
 * sends a request the API would answer with a `409`.
 */
export function AddRegionDialog(props: AddRegionDialogProps) {
  return (
    <RegionPickerDialog
      title="Add an operational region"
      description="Choose a whole province, or narrow down to a district or a tehsil. Use the arrow beside a region to see what's inside it."
      confirmLabel="Add region"
      {...props}
    />
  )
}
