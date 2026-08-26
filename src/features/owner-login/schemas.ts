import { z } from "zod"

export const mintOwnerLoginCodeSchema = z.object({
  turfId: z.string().uuid(),
  // When true, the owner's stored password is cleared so only the code
  // path works until they set a new one (suspected-compromise mode).
  lockPassword: z.boolean().default(false),
})
export type MintOwnerLoginCodeValues = z.infer<typeof mintOwnerLoginCodeSchema>

export const ownerCodeLoginSchema = z.object({
  phone: z.string().min(5, "ownerCode.errors.phoneRequired"),
  code: z.string().regex(/^\d{6}$/, "ownerCode.errors.codeFormat"),
})
export type OwnerCodeLoginValues = z.infer<typeof ownerCodeLoginSchema>
