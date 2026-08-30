import { UserRoundIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AvatarDisplay } from "@/features/player/avatar"

type PlayerAvatarSize = "xs" | "sm" | "md" | "lg" | "xl"

const SIZE_CLASSES: Record<PlayerAvatarSize, string> = {
  xs: "size-6",
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-20",
}

const INITIALS_TEXT_CLASSES: Record<PlayerAvatarSize, string> = {
  xs: "text-[9px]",
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-base",
  xl: "text-2xl",
}

/**
 * Renders any AvatarDisplay (photo / preset asset / initials). Works in
 * server and client components — pass a pre-translated `alt` string rather
 * than a dictionary key, since this component has no "use client" boundary.
 */
export function PlayerAvatar({
  display,
  size = "md",
  alt,
  className,
}: {
  display: AvatarDisplay
  size?: PlayerAvatarSize
  /** Pre-translated alt/aria label; omit for decorative use. */
  alt?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border",
        display.kind === "initials" && display.text
          ? "bg-primary/10"
          : "bg-muted",
        SIZE_CLASSES[size],
        className
      )}
      aria-hidden={alt ? undefined : true}
      role={alt ? "img" : undefined}
      aria-label={alt}
    >
      {display.kind === "initials" ? (
        display.text ? (
          <span
            className={cn(
              "select-none font-heading font-semibold text-primary",
              INITIALS_TEXT_CLASSES[size]
            )}
            aria-hidden
          >
            {display.text}
          </span>
        ) : (
          <UserRoundIcon
            className="size-1/2 text-muted-foreground"
            aria-hidden
          />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={display.src}
          alt={alt ?? ""}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  )
}
