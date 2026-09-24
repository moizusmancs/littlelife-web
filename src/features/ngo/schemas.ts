import { z } from 'zod'

/** PATCH /ngo/me (api/00-identity.md) — `name` can't be blank (trimmed first, so "  " fails the
 *  same as ""); `contact_email` may be empty (which *clears* it) but, when present, must be an
 *  email; `contact_phone` is free text with no format rule server-side, so none is invented here. */
export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Organisation name is required'),
  contactEmail: z
    .string()
    .trim()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, 'Enter a valid email address'),
  contactPhone: z.string().trim(),
})

export type OrganizationSettingsFormValues = z.infer<typeof organizationSettingsSchema>
