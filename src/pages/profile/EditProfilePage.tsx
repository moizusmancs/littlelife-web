import { EditProfileForm } from '@/features/profile/EditProfileForm'
import { useEditProfile } from '@/features/profile/useEditProfile'

/**
 * Container for /app/profile/edit — the query/form/mutation live in `useEditProfile` (shared with
 * the NGO/Admin My Account screen); EditProfileForm is pure presentation. Reads through the same
 * `PROFILE_QUERY_KEY` cache entry ProfileLayout's sidebar populates (TanStack Query dedupes the two
 * subscriptions into one real fetch), and a successful save writes back to it, so the sidebar's
 * name updates immediately with no second round trip.
 */
export function EditProfilePage() {
  const profile = useEditProfile()

  return (
    <EditProfileForm
      register={profile.register}
      errors={profile.errors}
      onSubmit={profile.onSubmit}
      isSubmitting={profile.isSubmitting}
      serverError={profile.serverError}
      isLoaded={profile.isLoaded}
      showSaved={profile.showSaved}
    />
  )
}
