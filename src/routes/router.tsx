import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CitizenLayout } from '@/layouts/CitizenLayout'
import { OpsLayout } from '@/layouts/OpsLayout'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { OnboardingProfilePage } from '@/pages/onboarding/OnboardingProfilePage'
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
          <Route path="/forgot-password" element={<PlaceholderPage title="Forgot Password" phase="Phase 1" />} />
          <Route path="/reset-password" element={<PlaceholderPage title="Reset Password" phase="Phase 1" />} />
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
          <Route element={<CitizenLayout />}>
            <Route path="/app/onboarding/region" element={<PlaceholderPage title="Onboarding — Region Picker" phase="Phase 2" />} />
            <Route path="/app/home" element={<PlaceholderPage title="Home" phase="Phase 8" />} />
            <Route path="/app/map" element={<PlaceholderPage title="Map" phase="Phase 3" />} />
            <Route path="/app/map/shelters/:id" element={<PlaceholderPage title="Shelter Detail" phase="Phase 3" />} />
            <Route path="/app/community" element={<PlaceholderPage title="Community Feed" phase="Phase 5" />} />
            <Route path="/app/community/:incidentId" element={<PlaceholderPage title="Incident Detail" phase="Phase 5" />} />
            <Route path="/app/resources" element={<PlaceholderPage title="Resources Hub" phase="Phase 6" />} />
            <Route path="/app/resources/aid/:id" element={<PlaceholderPage title="Aid Request Detail" phase="Phase 6" />} />
            <Route path="/app/resources/campaigns/:id" element={<PlaceholderPage title="Campaign Detail" phase="Phase 6" />} />
            <Route path="/app/resources/missing-persons/:id" element={<PlaceholderPage title="Missing Person Detail" phase="Phase 6" />} />
            <Route path="/app/navigate" element={<PlaceholderPage title="Safe Route Navigation" phase="Phase 7 (mocked)" />} />
            <Route path="/app/safety-groups" element={<PlaceholderPage title="Safety Groups" phase="Phase 4" />} />
            <Route path="/app/safety-groups/:id" element={<PlaceholderPage title="Safety Group Detail" phase="Phase 4" />} />
            <Route path="/app/messages/:conversationId" element={<PlaceholderPage title="Message Thread" phase="Phase 7 (mocked)" />} />
            <Route path="/app/alerts/:id" element={<PlaceholderPage title="Alert Takeover" phase="Phase 7 (mocked)" />} />
            <Route path="/app/profile" element={<PlaceholderPage title="Profile" phase="Phase 4" />} />
            <Route path="/app/profile/edit" element={<PlaceholderPage title="Edit Profile" phase="Phase 1 / 4" />} />
            <Route path="/app/profile/alert-preferences" element={<PlaceholderPage title="Alert Preferences" phase="Phase 4" />} />
            <Route path="/app/profile/account-settings" element={<PlaceholderPage title="Account Settings" phase="Phase 1" />} />
            <Route path="/app/profile/credibility" element={<PlaceholderPage title="Credibility" phase="Phase 4" />} />
            <Route path="/app/profile/activity" element={<PlaceholderPage title="Activity Timeline" phase="Phase 4" />} />
            <Route path="/app/profile/ngo" element={<PlaceholderPage title="My NGO" phase="Phase 1" />} />
            <Route path="/app/profile/invitations" element={<PlaceholderPage title="Invitations" phase="Phase 1" />} />
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
            <Route path="/ngo/volunteers" element={<PlaceholderPage title="Volunteers" phase="Phase 1" />} />
            <Route path="/ngo/shelters" element={<PlaceholderPage title="Shelters" phase="Phase 3" />} />
            <Route path="/ngo/shelters/:id" element={<PlaceholderPage title="Shelter Detail" phase="Phase 3" />} />
            <Route path="/ngo/campaigns" element={<PlaceholderPage title="Campaigns" phase="Phase 6" />} />
            <Route path="/ngo/campaigns/:id" element={<PlaceholderPage title="Campaign Detail" phase="Phase 6" />} />
            <Route path="/ngo/alerts" element={<PlaceholderPage title="Alerts & Community Updates" phase="Phase 5 / 7 (mocked)" />} />
            <Route path="/ngo/field-observations" element={<PlaceholderPage title="Field Observations" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/feedback" element={<PlaceholderPage title="Feedback" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/coordination" element={<PlaceholderPage title="Coordination" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/reports" element={<PlaceholderPage title="Reports" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/reports/:id" element={<PlaceholderPage title="Report Detail" phase="Phase 7 (mocked)" />} />
            <Route path="/ngo/settings/organization" element={<PlaceholderPage title="Organization Settings" phase="Phase 1" />} />
            <Route path="/ngo/settings/account" element={<PlaceholderPage title="My Account" phase="Phase 1" />} />
          </Route>
        </Route>

        {/* Admin Web */}
        <Route element={<RequireRole allowed={['admin', 'super_admin']} />}>
          <Route element={<OpsLayout role="admin" />}>
            <Route path="/admin/dashboard" element={<PlaceholderPage title="Admin Dashboard" phase="Phase 8" />} />
            <Route path="/admin/hazard-zones" element={<PlaceholderPage title="Hazard Zones & Predictions" phase="Phase 3" />} />
            <Route path="/admin/hazard-zones/:id" element={<PlaceholderPage title="Hazard Zone Detail" phase="Phase 3" />} />
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
            <Route path="/admin/users" element={<PlaceholderPage title="Users & Accounts" phase="Phase 1" />} />
            <Route path="/admin/users/:id" element={<PlaceholderPage title="Account Detail" phase="Phase 1 / 4" />} />
            <Route path="/admin/ngos" element={<PlaceholderPage title="NGOs" phase="Phase 1" />} />
            <Route path="/admin/ngos/:id" element={<PlaceholderPage title="NGO Detail" phase="Phase 1" />} />
            <Route path="/admin/regions" element={<PlaceholderPage title="Regions" phase="Phase 2" />} />
            <Route path="/admin/regions/:id" element={<PlaceholderPage title="Region Detail" phase="Phase 2" />} />
            <Route path="/admin/facilities" element={<PlaceholderPage title="Facilities" phase="Phase 3" />} />
            <Route path="/admin/offline-maps" element={<PlaceholderPage title="Offline Map Packages" phase="Phase 3" />} />
            <Route path="/admin/settings/account" element={<PlaceholderPage title="My Account" phase="Phase 1" />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
