/**
 * Cloudinary delivery-URL construction — pure string building, safe for both
 * server and client components (the SDK is not needed to *serve* images).
 *
 * Delivery transformations follow the optimization pipeline: every variant
 * caps width, applies q_auto, and negotiates the best format (f_auto) so
 * browsers get WebP/AVIF when they support it.
 */
export type ImageVariant = "thumb" | "card" | "hero" | "avatar" | "avatarFull"

export const VARIANT_TRANSFORMS: Record<ImageVariant, string> = {
  // Gallery thumbnails (owner edit + public strip).
  thumb: "c_fill,g_auto,w_400,h_300,q_auto,f_auto",
  // Discovery/listing cards (~800px, aspect-free).
  card: "c_limit,w_800,q_auto,f_auto",
  // Turf detail hero (~1600px).
  hero: "c_limit,w_1600,q_auto,f_auto",
  // Round avatars — face-focused crop.
  avatar: "c_fill,g_face,w_200,h_200,q_auto,f_auto",
  avatarFull: "c_limit,w_800,q_auto,f_auto",
}

export function buildImageUrl(
  cloudName: string,
  publicId: string,
  variant: ImageVariant
): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${VARIANT_TRANSFORMS[variant]}/${publicId}`
}

/**
 * Client-side helper for components that only have a publicId (the cloud
 * name is public — it appears in every delivered URL anyway).
 */
export function clientImageUrl(publicId: string, variant: ImageVariant): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  if (!cloudName) return publicId
  return buildImageUrl(cloudName, publicId, variant)
}
