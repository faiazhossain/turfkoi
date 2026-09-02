import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import {
  ArrowLeftIcon,
  MapPinIcon,
  PencilIcon,
  ZapIcon,
} from "lucide-react"

import { getPlayerProfile, isAvailabilityFresh } from "@/features/player/queries"
import { resolveAvatarDisplay } from "@/features/player/avatar"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { positionLabelKey, skillLabelKey } from "@/i18n/labels"
import { getSession } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { StatusBadge } from "@/components/shared"

export async function generateMetadata() {
  return buildMetadata({ titleKey: "metadata.profileTitle" })
}



export default async function ProfilePage() {
  const [session, t] = await Promise.all([getSession(), getT()])
  if (!session?.user) redirect("/login")

  const profile = await getPlayerProfile(session.user.id)
  const name = session.user.name ?? t("player.dashboardTitle")

  const display = resolveAvatarDisplay({
    avatarType: profile?.avatarType,
    avatarPublicId: profile?.avatarPublicId,
    avatarPresetId: profile?.avatarPresetId,
    name,
  })
  const avatarAlt =
    display.kind === "preset"
      ? t(display.labelKey)
      : display.kind === "photo"
        ? t(display.altKey)
        : undefined

  // Legacy free text renders as-is; canonical ids render localized.
  const primaryRaw = profile?.position ?? null
  const secondaryRaw = profile?.secondaryPosition ?? null
  const skillRaw = profile?.skill ?? null
  const primaryKey = positionLabelKey(primaryRaw)
  const secondaryKey = positionLabelKey(secondaryRaw)
  const skillKey = skillLabelKey(skillRaw)

  const availableNow = profile ? isAvailabilityFresh(profile) : false

  // Completion: name, avatar, position, skill, area, bio, location.
  const checks = [
    { done: !!session.user.name, needsKey: null },
    {
      done: display.kind !== "initials",
      needsKey: "profile.completionNeedsAvatar" as const,
    },
    {
      done: !!primaryRaw,
      needsKey: "profile.completionNeedsPosition" as const,
    },
    {
      done: !!skillRaw,
      needsKey: "profile.completionNeedsSkill" as const,
    },
    {
      done: !!profile?.area,
      needsKey: "profile.completionNeedsArea" as const,
    },
    {
      done: !!profile?.bio,
      needsKey: "profile.completionNeedsBio" as const,
    },
    {
      done: !!profile?.coords,
      needsKey: "profile.completionNeedsLocation" as const,
    },
  ]
  const doneCount = checks.filter((c) => c.done).length
  const percent = Math.round((doneCount / checks.length) * 100)
  const suggestions = checks
    .filter((c) => !c.done && c.needsKey)
    .map((c) => t(c.needsKey!))

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <nav className="text-sm text-dt-dim">
        <Link href="/app" className="inline-flex items-center gap-1 hover:text-dt-txt">
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          {t("profile.backToDashboard")}
        </Link>
      </nav>

      {/* Identity card */}
      <section className="rounded-lg border border-dt-line bg-dt-card p-5">
        <div className="flex items-start gap-4">
          <PlayerAvatar display={display} size="xl" alt={avatarAlt} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-heading text-xl font-semibold">
                {name}
              </h1>
              <StatusBadge
                status={availableNow ? "success" : "neutral"}
                icon={availableNow ? ZapIcon : undefined}
              >
                {availableNow
                  ? t("profile.availabilityOn")
                  : t("profile.availabilityOff")}
              </StatusBadge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dt-dim">
              {primaryRaw ? (
                <span className="font-medium text-dt-txt/90">
                  {primaryKey ? t(primaryKey) : primaryRaw}
                </span>
              ) : null}
              {secondaryRaw ? (
                <span>
                  ·{" "}
                  {secondaryKey ? t(secondaryKey) : secondaryRaw}
                </span>
              ) : null}
              {skillRaw ? (
                <span>· {skillKey ? t(skillKey) : skillRaw}</span>
              ) : null}
            </div>
            {profile?.area ? (
              <div className="mt-1 flex items-center gap-1 text-sm text-dt-dim">
                <MapPinIcon className="size-3.5" aria-hidden />
                {profile.area}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/app/profile/edit" />}
          >
            <PencilIcon aria-hidden />
            {t("profile.editCta")}
          </Button>
          <p className="mt-2 text-xs text-dt-dim">
            {t(availableNow ? "player.soloHintOn" : "player.soloHintOff")}
          </p>
        </div>
      </section>

      {/* About */}
      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">
          {t("profile.aboutTitle")}
        </h2>
        {profile?.bio ? (
          <p className="rounded-lg border border-dt-line bg-dt-card p-4 text-sm whitespace-pre-line">
            {profile.bio}
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-dt-line p-4 text-sm text-dt-dim">
            {t("profile.aboutEmpty")}
          </p>
        )}
      </section>

      {/* Playing info */}
      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">
          {t("profile.playingInfoTitle")}
        </h2>
        <dl className="divide-y divide-dt-line rounded-lg border border-dt-line bg-dt-card">
          <InfoRow label={t("profile.positionLabel")}>
            {primaryRaw ? (primaryKey ? t(primaryKey) : primaryRaw) : t("profile.notSet")}
          </InfoRow>
          <InfoRow label={t("profile.secondaryPositionLabel")}>
            {secondaryRaw
              ? secondaryKey
                ? t(secondaryKey)
                : secondaryRaw
              : t("profile.notSet")}
          </InfoRow>
          <InfoRow label={t("profile.skillLabel")}>
            {skillRaw ? (skillKey ? t(skillKey) : skillRaw) : t("profile.notSet")}
          </InfoRow>
          <InfoRow label={t("profile.areaLabel")}>
            {profile?.area ?? t("profile.notSet")}
          </InfoRow>
        </dl>
        <p className="text-xs text-dt-dim">
          {t("profile.locationPrivacy")}
        </p>
      </section>

      {/* Completion */}
      <section className="space-y-2 rounded-lg border border-dt-line bg-dt-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold">
            {t("profile.completionTitle")}
          </h2>
          <span className="text-sm tabular-nums text-dt-dim">
            {t("profile.completionLabel", { percent })}
          </span>
        </div>
        <Progress value={percent} aria-label={t("profile.completionTitle")} />
        {suggestions.length > 0 ? (
          <ul className="space-y-1 pt-1 text-sm text-dt-dim">
            {suggestions.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function InfoRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 text-sm">
      <dt className="text-dt-dim">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

export const dynamic = "force-dynamic"
