import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CitizenLayout } from '@/layouts/CitizenLayout'
import { OpsLayout } from '@/layouts/OpsLayout'
import { ProfileLayout } from '@/layouts/ProfileLayout'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { OnboardingProfilePage } from '@/pages/onboarding/OnboardingProfilePage'
import { OnboardingRegionPage } from '@/pages/onboarding/OnboardingRegionPage'
import { EditProfilePage } from '@/pages/profile/EditProfilePage'
import { AccountSettingsPage } from '@/pages/profile/AccountSettingsPage'
import { CredibilityPage } from '@/pages/profile/CredibilityPage'
import { MyNgoPage } from '@/pages/profile/MyNgoPage'
import { InvitationsPage } from '@/pages/profile/InvitationsPage'
import { NgoShelterDetailPage } from '@/pages/ngo/NgoShelterDetailPage'
import { NgoSheltersPage } from '@/pages/ngo/NgoSheltersPage'
import { OrganizationSettingsPage } from '@/pages/ngo/OrganizationSettingsPage'
import { VolunteersPage } from '@/pages/ngo/VolunteersPage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { UserDetailPage } from '@/pages/admin/UserDetailPage'
import { NgosPage } from '@/pages/admin/NgosPage'
import { NgoDetailPage } from '@/pages/admin/NgoDetailPage'
import { RegionsPage } from '@/pages/admin/RegionsPage'
import { HazardZoneDetailPage } from '@/pages/admin/HazardZoneDetailPage'
import { FacilitiesPage } from '@/pages/admin/FacilitiesPage'
import { HazardZonesPage } from '@/pages/admin/HazardZonesPage'
import { MapPage } from '@/pages/citizen/MapPage'
import { ResourcesPage } from '@/pages/citizen/ResourcesPage'
import { SafetyGroupDetailPage } from '@/pages/citizen/SafetyGroupDetailPage'
import { SafetyGroupsPage } from '@/pages/citizen/SafetyGroupsPage'
import { ShelterDetailPage } from '@/pages/citizen/ShelterDetailPage'
import { MyAccountPage } from '@/pages/account/MyAccountPage'
import { RedirectIfAuthenticated, RequireIncompleteProfile, RequireRole, RequireUnverifiedSession } from '@/routes/guards'

/** Full route tree per WEB_DESIGN_PLAN.md §2. Every leaf is a PlaceholderPage until its real
 *  phase (noted per-route below) replaces it — swap one `element` at a time, the tree itself
 *  shouldn't need to change shape when that happens. */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        {/* Mandatory onboarding, step 1 of 2 — must be authenticated (registration logs the
            account in immediately) but not yet verified; see RequireUnverifiedSession. */}
        <Route element={<RequireUnverifiedSession />}>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Route>

        {/* Mandatory onboarding, step 2 of 2 — verified but the profile's `name` is still the
            empty-string "not yet set" state; see RequireIncompleteProfile. No nav chrome (same
            AuthLayout shell as the rest of the pre-app flow), not CitizenLayout. */}
        <Route element={<RequireIncompleteProfile />}>
          <Route path="/app/onboarding/profile" element={<OnboardingProfilePage />} />
        </Route>

        {/* Citizen Web */}
        <Route element={<RequireRole allowed={['user']} />}>
          {/* Optional last onboarding step (choose a home region, or skip) — full viewport, no nav
              chrome, and never forced: nothing in the backend requires a home region. */}
          <Route path="/app/onboarding/region" element={<OnboardingRegionPage />} />
          {/* The map owns the whole area under the header: no page padding or scrolling. */}
          <Route element={<CitizenLayout fullBleed />}>
            <Route path="/app/map" element={<MapPage />} />
          </Route>
          <Route element={<CitizenLayout />}>
            <Route path="/app/home" element={<PlaceholderPage title="Home" phase="Phase 8" />} />
            <Route path="/app/map/shelters/:id" element={<ShelterDetailPage />} />
            <Route path="/app/community" element={<PlaceholderPage title="Community Feed" phase="Phase 5" />} />
            <Route path="/app/community/:incidentId" element={<PlaceholderPage title="Incident Detail" phase="Phase 5" />} />
            <Route path="/app/resources" element={<ResourcesPage />} />
            <Route path="/app/resources/aid/:id" element={<PlaceholderPage title="Aid Request Detail" phase="Phase 6" />} />
            <Route path="/app/resources/campaigns/:id" element={<PlaceholderPage title="Campaign Detail" phase="Phase 6" />} />
            <Route path="/app/resources/missing-persons/:id" element={<PlaceholderPage title="Missing Person Detail" phase="Phase 6" />} />
            <Route path="/app/navigate" element={<PlaceholderPage title="Safe Route Navigation" phase="Phase 7 (mocked)" />} />
            <Route path="/app/messages/:conversationId" element={<PlaceholderPage title="Message Thread" phase="Phase 7 (mocked)" />} />
            <Route path="/app/alerts/:id" element={<PlaceholderPage title="Alert Takeover" phase="Phase 7 (mocked)" />} />
            {/* Shared W-Settings sub-nav shell (ProfileLayout) — every /app/profile/* screen
                renders inside it, even the ones still ⬜ placeholder, so the sidebar stays
                present and consistent while navigating between built and not-yet-built
                sub-screens; see ProfileLayout/ProfileSidebar's own comments. */}
            <Route element={<ProfileLayout />}>
              <Route path="/app/profile" element={<PlaceholderPage title="Profile Overview" phase="Phase 4" />} />
              <Route path="/app/profile/edit" element={<EditProfilePage />} />
              <Route path="/app/profile/alert-preferences" element={<PlaceholderPage title="Alert Preferences" phase="Phase 4" />} />
              <Route path="/app/profile/account-settings" element={<AccountSettingsPage />} />
              <Route path="/app/profile/credibility" element={<CredibilityPage />} />
              <Route path="/app/profile/activity" element={<PlaceholderPage title="Activity Timeline" phase="Phase 4" />} />
              <Route path="/app/profile/ngo" element={<MyNgoPage />} />
              <Route path="/app/profile/invitations" element={<InvitationsPage />} />
              {/* Safety Groups keep their own `/app/safety-groups` URLs (WEB_DESIGN_PLAN §2) but sit
                  under the Profile sub-nav (the mockup and the sidebar both put them there), so they
                  render inside this layout too. */}
              <Route path="/app/safety-groups" element={<SafetyGroupsPage />} />
              <Route path="/app/safety-groups/:id" element={<SafetyGroupDetailPage />} />
            </Route>
          </Route>
        </Route>

        {/* NGO Web */}
        <Route element={<RequireRole allowed={['ngo_admin', 'ngo_volunteer']} />}>
          <Route element={<OpsLayout role="ngo" />}>
            <Route path="/ngo/dashboard" element={<PlaceholderPage title="NGO Dashboard" phase="Phase 8" />} />
            <Route path="/ngo/incidents" element={<PlaceholderPage title="Incidents" phase="Phase 5" />} />
            <Route path="/ngo/incidents/:id" element={<PlaceholderPage title="Incident Detail" phase="Phase 5" />} />
            <Route path="/ngo/aid-requests" element={<PlaceholderPage title="Aid Requests" phase="Phase 6" />} />
            <Route path="/ngo/aid-requests/:id" element={<PlaceholderPage title="Aid Request Detail" phase="Phase 6" />} />
            <Route path="/ngo/missing-persons" element={<PlaceholderPage title="Missing Persons" phase="Phase 6" />} />
            <Route path="/ngo/missing-persons/:id" element={<PlaceholderPage title="Missing Person Detail" phase="Phase 6" />} />
            <Route path="/ngo/tasks" element={<PlaceholderPage title="Tasks" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/shelters" element={<NgoSheltersPage />} />
            <Route path="/ngo/shelters/:id" element={<NgoShelterDetailPage />} />
            <Route path="/ngo/campaigns" element={<PlaceholderPage title="Campaigns" phase="Phase 6" />} />
            <Route path="/ngo/campaigns/:id" element={<PlaceholderPage title="Campaign Detail" phase="Phase 6" />} />
            <Route path="/ngo/alerts" element={<PlaceholderPage title="Alerts & Community Updates" phase="Phase 5 / 7 (mocked)" />} />
            <Route path="/ngo/field-observations" element={<PlaceholderPage title="Field Observations" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/feedback" element={<PlaceholderPage title="Feedback" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/coordination" element={<PlaceholderPage title="Coordination" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/reports" element={<PlaceholderPage title="Reports" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/reports/:id" element={<PlaceholderPage title="Report Detail" phase="Phase 7 (mocked)" />} />
            {/* ngo_admin only — a volunteer is bounced to their own landing route by this nested
                guard (the sidebar hides the link for them too, but hiding isn't enforcement). */}
            <Route element={<RequireRole allowed={['ngo_admin']} />}>
              <Route path="/ngo/volunteers" element={<VolunteersPage />} />
              <Route path="/ngo/settings/organization" element={<OrganizationSettingsPage />} />
            </Route>
            <Route path="/ngo/settings/account" element={<MyAccountPage />} />
          </Route>
        </Route>

        {/* Admin Web */}
        <Route element={<RequireRole allowed={['admin', 'super_admin']} />}>
          <Route element={<OpsLayout role="admin" />}>
            <Route path="/admin/dashboard" element={<PlaceholderPage title="Admin Dashboard" phase="Phase 8" />} />
            <Route path="/admin/hazard-zones" element={<HazardZonesPage />} />
            <Route path="/admin/hazard-zones/:id" element={<HazardZoneDetailPage />} />
            <Route path="/admin/incident-reports" element={<PlaceholderPage title="Incident Reports" phase="Phase 5" />} />
            <Route path="/admin/incident-reports/:id" element={<PlaceholderPage title="Incident Report Detail" phase="Phase 5" />} />
            <Route path="/admin/alerts" element={<PlaceholderPage title="Alerts & Broadcasts" phase="Phase 7 (mocked)" />} />
            <Route path="/admin/tasks" element={<PlaceholderPage title="Task Assignments" phase="Phase 7 (mocked)" />} />
            <Route path="/admin/relief-operations" element={<PlaceholderPage title="Relief Operations Overview" phase="Phase 6" />} />
            <Route path="/admin/escalations" element={<PlaceholderPage title="Escalations & Coordination" phase="Phase 7 (mocked)" />} />
            <Route path="/admin/analytics" element={<PlaceholderPage title="Analytics" phase="Phase 7 (mocked)" />} />
            <Route path="/admin/reports" element={<PlaceholderPage title="Reports" phase="Phase 7 (mocked)" />} />
            <Route path="/admin/reports/:id" element={<PlaceholderPage title="Report Detail" phase="Phase 7 (mocked)" />} />
            <Route path="/admin/audit-log" element={<PlaceholderPage title="Audit Log" phase="Phase 7 (mocked)" />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:id" element={<UserDetailPage />} />
            <Route path="/admin/ngos" element={<NgosPage />} />
            <Route path="/admin/ngos/:id" element={<NgoDetailPage />} />
            <Route path="/admin/regions/:id?" element={<RegionsPage />} />
            <Route path="/admin/facilities" element={<FacilitiesPage />} />
            <Route path="/admin/offline-maps" element={<PlaceholderPage title="Offline Map Packages" phase="Phase 3" />} />
            <Route path="/admin/settings/account" element={<MyAccountPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
