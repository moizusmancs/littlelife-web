import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { AddRegionDialog } from '@/features/ngo/AddRegionDialog'
import { DeactivateOrganizationDialog } from '@/features/ngo/DeactivateOrganizationDialog'
import { OperationalRegionsCard } from '@/features/ngo/OperationalRegionsCard'
import { RemoveRegionDialog } from '@/features/ngo/RemoveRegionDialog'
import { useOperationalRegions } from '@/features/ngo/useOperationalRegions'
import { OrganizationDangerZone } from '@/features/ngo/OrganizationDangerZone'
import { OrganizationLoadState } from '@/features/ngo/OrganizationLoadState'
import { OrganizationProfileCard } from '@/features/ngo/OrganizationProfileCard'
import {
  organizationSettingsSchema,
  type OrganizationSettingsFormValues,
} from '@/features/ngo/schemas'
import {
  deactivateMyNgo,
  getMyNgo,
  NGO_ME_QUERY_KEY,
  updateMyNgo,
  type NgoRegistration,
  type UpdateMyNgoInput,
} from '@/api/identity'
import type { ApiErrorBody } from '@/api/types'

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}

function toFormValues(ngo: NgoRegistration): OrganizationSettingsFormValues {
  return { name: ngo.name, contactEmail: ngo.contact_email ?? '', contactPhone: ngo.contact_phone ?? '' }
}

/** Only what differs from the server's copy. `PATCH /ngo/me` is a real partial patch, and the doc
 *  warns that re-sending an untouched `contact_email: ""` would clear it — so unchanged fields are
 *  left out entirely rather than echoed back. */
function buildPatch(values: OrganizationSettingsFormValues, ngo: NgoRegistration): UpdateMyNgoInput {
  const current = toFormValues(ngo)
  const patch: UpdateMyNgoInput = {}
  if (values.name !== current.name) patch.name = values.name
  if (values.contactEmail !== current.contactEmail) patch.contactEmail = values.contactEmail
  if (values.contactPhone !== current.contactPhone) patch.contactPhone = values.contactPhone
  return patch
}

/**
 * Container for /ngo/settings/organization — `ngo_admin` only (the route sits behind
 * `RequireRole allowed={['ngo_admin']}`; a volunteer never mounts this, and the sidebar hides the
 * link for them too). Owns the `GET /ngo/me` query, the edit form, and both mutations;
 * OrganizationProfileCard/OrganizationDangerZone/DeactivateOrganizationDialog/
 * OrganizationLoadState are pure presentation.
 *
 * The form hydrates from the query via `values` (like EditProfilePage), so a save — which writes the
 * server's response straight back into the cache — resets dirtiness and drives the "Saved"
 * indicator without a timer, and Discard is just `reset` to the server's copy. Save sends only the
 * changed fields (see `buildPatch`); if trimming leaves nothing actually different, it skips the
 * network entirely rather than tripping the API's "at least one field" 400.
 *
 * The operational-regions card, its add picker and its remove confirmation are `useOperationalRegions`'s
 * (the organisation's coverage is a separate `GET /ngo/me/regions`, so it loads and fails on its own
 * without taking the settings form with it).
 *
 * Deactivate refetches on success (and on failure, since the likeliest failure is a `409` because
 * it's already inactive) so the status badge and the danger zone always show the server's truth.
 * The backend has no status guard on edits, so a deactivated organisation stays editable here too.
 */
export function OrganizationSettingsPage() {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const regions = useOperationalRegions({ onNotice: setNotice })

  const query = useQuery({ queryKey: NGO_ME_QUERY_KEY, queryFn: getMyNgo })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OrganizationSettingsFormValues>({
    resolver: zodResolver(organizationSettingsSchema),
    defaultValues: { name: '', contactEmail: '', contactPhone: '' },
    values: query.data ? toFormValues(query.data) : undefined,
  })

  const updateMutation = useMutation({
    mutationFn: async (values: OrganizationSettingsFormValues) => {
      const current = query.data as NgoRegistration
      const patch = buildPatch(values, current)
      return Object.keys(patch).length === 0 ? current : updateMyNgo(patch)
    },
    onSuccess: (updated) => {
      setServerError(null)
      queryClient.setQueryData(NGO_ME_QUERY_KEY, updated)
      reset(toFormValues(updated))
    },
    onError: (error) => setServerError(extractErrorMessage(error)),
  })

  const deactivateMutation = useMutation({
    mutationFn: deactivateMyNgo,
    onSuccess: async () => {
      setDeactivateError(null)
      setDeactivateOpen(false)
      await queryClient.invalidateQueries({ queryKey: NGO_ME_QUERY_KEY })
    },
    onError: (error) => {
      setDeactivateError(extractErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: NGO_ME_QUERY_KEY })
    },
  })

  if (query.isPending) return <OrganizationLoadState error={null} onRetry={() => void query.refetch()} />
  if (query.isError) {
    return <OrganizationLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  }

  const organization = query.data

  return (
    <div className="flex max-w-205 flex-col gap-5">
      <div>
        <h1 className="font-heading text-h2 font-bold text-ink-900">Organization Settings</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">
          How your organisation appears on LittleLife, and its contact details.
        </p>
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <OrganizationProfileCard
        organization={organization}
        register={register}
        errors={errors}
        onSubmit={handleSubmit((values) => updateMutation.mutate(values))}
        onDiscard={() => {
          setServerError(null)
          reset(toFormValues(organization))
        }}
        isSubmitting={isSubmitting || updateMutation.isPending}
        isDirty={isDirty}
        serverError={serverError}
        showSaved={updateMutation.isSuccess && !isDirty}
      />

      <OperationalRegionsCard {...regions.card} />

      <OrganizationDangerZone
        status={organization.status}
        onDeactivateClick={() => {
          setDeactivateError(null)
          setDeactivateOpen(true)
        }}
      />

      <AddRegionDialog {...regions.addDialog} />
      <RemoveRegionDialog {...regions.removeDialog} />

      <DeactivateOrganizationDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        organizationName={organization.name}
        onConfirm={() => deactivateMutation.mutate()}
        isSubmitting={deactivateMutation.isPending}
        serverError={deactivateError}
      />
    </div>
  )
}
