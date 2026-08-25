/**
 * English dictionary — the TypeScript source of truth for keys.
 * `bn.ts` is typed as `Dictionary` so any key drift fails to compile.
 *
 * Bangla is the product's primary language; English is secondary.
 * New user-facing strings MUST be added to BOTH dictionaries in the
 * same change, Bangla first.
 */
export const en = {
  common: {
    cancel: "Cancel",
    save: "Save",
    saveChanges: "Save changes",
    delete: "Delete",
    confirm: "Confirm",
    continue: "Continue",
    back: "Back",
    close: "Close",
    loading: "Loading…",
    retry: "Retry",
    search: "Search",
    submit: "Submit",
    edit: "Edit",
    viewDetails: "View details",
    learnMore: "Learn more",
  },

  nav: {
    home: "Home",
    turfs: "Turfs",
    matches: "Matches",
    profile: "Profile",
    signIn: "Sign in",
    signOut: "Sign out",
    dashboard: "Dashboard",
    adminConsole: "Admin console",
    bookTurf: "Book a turf",
    language: "Language",
    footerTagline: "Book. Match. Play.",
    footerPayments: "Prices in BDT. Payments via bKash.",
  },

  home: {
    badge: "Made for turf sports in Bangladesh",
    heroBookTurf: "Book a turf.",
    heroFindOpponent: "Find an opponent.",
    heroFillAndPlay: "Fill the gap. Play.",
    heroBody:
      "Turfkoi brings turf booking, team matchmaking, and filling missing roster spots into one place. Prices in Taka, payments via bKash.",
    ctaBook: "Book a turf",
    ctaFindMatch: "Find a match",
    featureBookTitle: "Book a turf",
    featureBookDesc:
      "Browse turfs near you, pick a slot, and pay by bKash. A transparent fee is locked at checkout - never changed after.",
    featureOpponentTitle: "Find an opponent",
    featureOpponentDesc:
      "Publish your match and let rival teams accept. No more scrambling on WhatsApp to fill a booked slot.",
    featureRosterTitle: "Fill your roster",
    featureRosterDesc:
      "Short on players? Solo players nearby can request to join your match as guests for the game.",
  },

  metadata: {
    rootTitle: "Turfkoi - Book a turf. Find an opponent. Play.",
    rootDescription:
      "Book turfs in Bangladesh, find an opposing team, fill missing roster spots, and play. Prices in Taka, payments via bKash.",
  },

  errors: {
    generic: "Something went wrong. Please try again.",
  },
}

export type Dictionary = typeof en
