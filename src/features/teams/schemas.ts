import { z } from "zod"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const teamFormSchema = z.object({
  name: z.string().min(2, "team.errors.nameShort").max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(slugRegex, "team.errors.slugFormat"),
})
export type TeamFormValues = z.infer<typeof teamFormSchema>

export const addMemberSchema = z.object({
  phone: z
    .string()
    .min(6, "team.errors.phoneInvalid")
    .max(20, "team.errors.phoneLong"),
  role: z.enum(["player", "captain", "manager"]).default("player"),
})
export type AddMemberValues = z.infer<typeof addMemberSchema>

export const updateMemberRoleSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["player", "captain", "manager", "owner"]),
})
export type UpdateMemberRoleValues = z.infer<typeof updateMemberRoleSchema>

export const transferOwnershipSchema = z.object({
  teamId: z.string().uuid(),
  newOwnerId: z.string().uuid(),
})
export type TransferOwnershipValues = z.infer<typeof transferOwnershipSchema>
