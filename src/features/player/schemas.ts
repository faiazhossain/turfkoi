import { z } from "zod"

export const updateProfileSchema = z.object({
  position: z.string().max(40).optional(),
  skill: z.string().max(40).optional(),
  area: z.string().max(80).optional(),
  coords: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
})
export type UpdateProfileValues = z.infer<typeof updateProfileSchema>
