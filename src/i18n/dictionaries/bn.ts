import type { Dictionary } from "./en"

/**
 * Bangla dictionary — the primary product language.
 *
 * Style: natural Bangladeshi product Bangla, never literal translation.
 * Familiar English terms (turf, slot, team, player, booking, OTP, bKash,
 * Turfkoi…) stay in English inside Bangla sentences where that reads
 * more naturally.
 */
export const bn: Dictionary = {
  common: {
    cancel: "বাতিল",
    save: "সেভ করুন",
    saveChanges: "পরিবর্তন সেভ করুন",
    delete: "ডিলিট",
    confirm: "নিশ্চিত করুন",
    continue: "এগিয়ে যান",
    back: "পেছনে",
    close: "বন্ধ করুন",
    loading: "লোড হচ্ছে…",
    retry: "আবার চেষ্টা করুন",
    search: "খুঁজুন",
    submit: "সাবমিট",
    edit: "এডিট",
    viewDetails: "বিস্তারিত দেখুন",
    learnMore: "আরও জানুন",
  },

  nav: {
    home: "হোম",
    turfs: "টার্ফ",
    matches: "ম্যাচ",
    profile: "প্রোফাইল",
    signIn: "সাইন ইন",
    signOut: "সাইন আউট",
    dashboard: "ড্যাশবোর্ড",
    adminConsole: "Admin কনসোল",
    bookTurf: "টার্ফ বুক করুন",
    language: "ভাষা",
    footerTagline: "বুক করুন। ম্যাচ করুন। খেলুন।",
    footerPayments: "দাম টাকায় (BDT)। পেমেন্ট bKash-এ।",
  },

  home: {
    badge: "বাংলাদেশের টার্ফ খেলার জন্য তৈরি",
    heroBookTurf: "টার্ফ বুক করুন।",
    heroFindOpponent: "প্রতিপক্ষ খুঁজুন।",
    heroFillAndPlay: "টিম পূর্ণ করুন। খেলুন।",
    heroBody:
      "Turfkoi-তে টার্ফ বুকিং থেকে শুরু করে প্রতিপক্ষ টিম ও অতিরিক্ত খেলোয়াড় খোঁজা—খেলার জন্য যা কিছু দরকার, সব এক জায়গায়। দাম বাংলাদেশি টাকায়, পেমেন্ট bKash-এ।",
    ctaBook: "টার্ফ বুক করুন",
    ctaFindMatch: "ম্যাচ খুঁজুন",
    featureBookTitle: "টার্ফ বুক করুন",
    featureBookDesc:
      "কাছের টার্ফ দেখুন, সুবিধামতো slot বেছে নিন, bKash-এ পেমেন্ট করুন। স্বচ্ছ ফি চেকআউটের সময়ই ঠিক হয়ে যায়—পরে কখনো বদলায় না।",
    featureOpponentTitle: "প্রতিপক্ষ খুঁজুন",
    featureOpponentDesc:
      "আপনার ম্যাচ পাবলিশ করুন, প্রতিপক্ষ টিম নিজেই accept করবে। WhatsApp-এ খালি slot ভরার জন্য হন্যে হওয়ার দরকার নেই।",
    featureRosterTitle: "টিম পূর্ণ করুন",
    featureRosterDesc:
      "খেলোয়াড় কম? কাছের solo player-রা ম্যাচে guest হিসেবে যোগ দেওয়ার রিকোয়েস্ট পাঠাতে পারবে।",
  },

  metadata: {
    rootTitle: "Turfkoi — টার্ফ বুক করুন। প্রতিপক্ষ খুঁজুন। খেলুন।",
    rootDescription:
      "বাংলাদেশে টার্ফ বুক করুন, প্রতিপক্ষ টিম খুঁজুন, টিমের খালি জায়গা পূরণ করে খেলুন। দাম টাকায়, পেমেন্ট bKash-এ।",
  },

  errors: {
    generic: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
  },
}
