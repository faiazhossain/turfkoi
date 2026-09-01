import { PresenceTouch } from "@/components/player/presence-touch"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PresenceTouch />
      {children}
    </>
  )
}
