import { AccountDetailsCard } from '@/features/profile/AccountDetailsCard'
import { EditProfileForm } from '@/features/profile/EditProfileForm'
import { HomeRegionCard } from '@/features/profile/HomeRegionCard'
import { useEditProfile } from '@/features/profile/useEditProfile'
import { useHomeRegion } from '@/features/profile/useHomeRegion'
import { RegionPickerDialog } from '@/features/regions/RegionPickerDialog'
import { useAuthStore } from '@/store/auth'

/**
 * Container for /app/profile/edit — the name's query/form/mutation live in `useEditProfile` (shared
 * with the NGO/Admin My Account screen) and the home region's in `useHomeRegion`; EditProfileForm,
 * HomeRegionCard and the picker dialog are pure presentation. Both read through the same
 * `PROFILE_QUERY_KEY` cache entry ProfileLayout's sidebar populates (TanStack Query dedupes the
 * subscriptions into one real fetch), and a successful save of either writes back to it, so the
 * sidebar's name and home-region line update immediately with no second round trip. Below them, a read-only
 * card of the account's email and creation date: the profile really is just a name and a home region (the API has no
 * phone number, photo or anything else), so there are no further fields to edit.
 */
export function EditProfilePage() {
  const profile = useEditProfile()
  const homeRegion = useHomeRegion()
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex max-w-140 flex-col gap-5">
      <EditProfileForm
        register={profile.register}
        errors={profile.errors}
        onSubmit={profile.onSubmit}
        isSubmitting={profile.isSubmitting}
        serverError={profile.serverError}
        isLoaded={profile.isLoaded}
        showSaved={profile.showSaved}
      />
      <HomeRegionCard {...homeRegion.card} />
      {user && <AccountDetailsCard email={user.email} emailVerified={user.emailVerified} memberSince={profile.memberSince} />}
      <RegionPickerDialog {...homeRegion.dialog} />
    </div>
  )
}
