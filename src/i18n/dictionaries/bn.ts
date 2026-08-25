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

  auth: {
    signInTitle: "সাইন ইন",
    signInDesc: "যে phone number বা email দিয়ে অ্যাকাউন্ট খুলেছিলেন সেটা দিয়ে সাইন ইন করুন।",
    identifierLabel: "Phone বা email",
    identifierPlaceholder: "01XXXXXXXXX বা you@email.com",
    passwordLabel: "পাসওয়ার্ড",
    forgotPassword: "পাসওয়ার্ড ভুলে গেছেন?",
    signingIn: "সাইন ইন হচ্ছে…",
    newHere: "নতুন এসেছেন?",
    createAccount: "অ্যাকাউন্ট খুলুন",

    registerTitle: "অ্যাকাউন্ট খুলুন",
    registerDesc: "Phone number ও email দিয়ে রেজিস্টার করুন। verification code আপনার email-এ পাঠানো হবে।",
    nameLabel: "নাম",
    namePlaceholder: "আপনার নাম",
    phoneLabel: "Phone number",
    emailLabel: "Email",
    passwordPlaceholder: "কমপক্ষে ৮ অক্ষর",
    confirmPassword: "পাসওয়ার্ড আবার লিখুন",
    sendingCode: "কোড পাঠানো হচ্ছে…",
    devCodeHint: "Dev mode: কোড 123456 ব্যবহার করুন",
    enterCodeTitle: "কোড লিখুন",
    sentCodeTo: "{email} ঠিকানায় একটি ৬-ডিজিটের কোড পাঠানো হয়েছে।",
    codeLabel: "Verification code",
    verifying: "যাচাই হচ্ছে…",
    verifyAndCreate: "যাচাই করে অ্যাকাউন্ট খুলুন",
    changeDetails: "তথ্য বদলান",
    resendCode: "কোড আবার পাঠান",
    alreadyHaveAccount: "আগেই অ্যাকাউন্ট আছে?",

    resetTitle: "পাসওয়ার্ড রিসেট করুন",
    resetDesc: "যে email দিয়ে রেজিস্টার করেছিলেন সেটা লিখুন। অ্যাকাউন্ট থাকলে verification code পাঠানো হবে।",
    sentCodeResetTo: "{email} ঠিকানায় একটি ৬-ডিজিটের কোড পাঠানো হয়েছে। কোডটি লিখে নতুন পাসওয়ার্ড দিন।",
    sendCode: "কোড পাঠান",
    newPassword: "নতুন পাসওয়ার্ড",
    confirmNewPassword: "নতুন পাসওয়ার্ড আবার লিখুন",
    saving: "সেভ হচ্ছে…",
    setNewPassword: "নতুন পাসওয়ার্ড সেট করুন",
    useDifferentEmail: "অন্য email ব্যবহার করুন",
    rememberedIt: "মনে পড়েছে?",
    backToSignIn: "সাইন ইনে ফিরে যান",

    onboardingTitle: "প্রোফাইল সেট করুন",
    onboardingDesc: "কিছু তথ্য দিন—team আর player-রা যেন আপনাকে খুঁজে পায়।",
    displayName: "Display name",
    positionLabel: "পজিশন (optional)",
    skillLabel: "Skill (optional)",
    areaLabel: "এলাকা (optional)",
    positionPlaceholder: "যেমন MID",
    skillPlaceholder: "যেমন Intermediate",
    areaPlaceholder: "যেমন ধানমন্ডি, ঢাকা",
    yourLocation: "আপনার location",
    locationHelp:
      "কাছের ম্যাচ যেন আপনাকে খুঁজে পায় সেজন্য location দিন। আমরা প্রায় ১০০ মিটারের মধ্যে একটি আনুমানিক জায়গা সেভ করি—আসল ঠিকানা কখনোই না।",

    ownATurfTitle: "টার্ফের মালিক?",
    ownATurfDesc: "Turfkoi-তে turf owner-রা কীভাবে অ্যাকাউন্ট পান।",
    ownerStep1Title: "আমরা আপনার টার্ফ লিস্ট করি",
    ownerStep1Body: "Turf অ্যাকাউন্ট ইনভাইটেশনের মাধ্যমে তৈরি হয়। Turfkoi team আগে আপনার টার্ফ প্ল্যাটফর্মে যোগ করে।",
    ownerStep2Title: "আপনি claim link পান",
    ownerStep2Body: "Turfkoi team আপনাকে WhatsApp বা email-এ একটি ব্যক্তিগত link পাঠায়। linkটি ১৪ দিন ব্যবহারযোগ্য থাকে।",
    ownerStep3Title: "link খুলে রেজিস্টার বা সাইন ইন করুন",
    ownerStep3Body: "এই পেজে অ্যাকাউন্ট খুলুন, অথবা আগে থেকেই অ্যাকাউন্ট থাকলে সাইন ইন করুন। এরপর সোজা আপনার টার্ফে চলে যাবেন।",
    ownerStep4Title: "“Claim turf” চাপুন",
    ownerStep4Body: "এতে আপনি owner হয়ে যাবেন। এরপর slot, দাম আর ছবি সেট করবেন।",
    ownerHelpNote: "এখনো link পাননি? টার্ফ লিস্ট করার আবেদন করুন—Turfkoi team প্রতিটি আবেদন দেখে পরের ধাপ জানায়।",
    listYourTurf: "আপনার টার্ফ লিস্ট করুন",
    passwordsNoMatch: "পাসওয়ার্ড দুটো মিলছে না",

    errors: {
      invalid_credentials: "Phone/email বা পাসওয়ার্ড ভুল।",
      rate_limited: "অনেকবার চেষ্টা হয়ে গেছে। একটু পরে আবার করুন।",
      signin_failed: "সাইন ইন করা গেল না। একটু পরে আবার চেষ্টা করুন।",
      phone_taken: "এই phone number দিয়ে আগেই একটি অ্যাকাউন্ট আছে।",
      email_taken: "এই email দিয়ে আগেই একটি অ্যাকাউন্ট আছে।",
      phone_taken_just: "এই phone number এইমাত্র রেজিস্টার হয়ে গেছে। সাইন ইন করুন।",
      email_taken_just: "এই email এইমাত্র রেজিস্টার হয়ে গেছে। সাইন ইন করুন।",
      signin_failed_created: "অ্যাকাউন্ট তৈরি হয়েছে, কিন্তু সাইন ইন হয়নি। সাইন ইন করার চেষ্টা করুন।",
      send_failed: "এই মুহূর্তে email পাঠানো গেল না। আবার চেষ্টা করুন।",
      invalid: "কোড ভুল। আবার চেষ্টা করুন।",
      consumed: "কোডটি আগেই ব্যবহার হয়েছে। নতুন কোড নিন।",
      expired: "কোডের সময় শেষ হয়ে গেছে। নতুন কোড নিন।",
      locked: "অনেকবার ভুল হয়েছে। ১৫ মিনিট পর চেষ্টা করুন।",
      invalid_email: "সঠিক email লিখুন।",
      name_short: "নাম খুব ছোট",
      name_max: "নাম খুব বড়",
      phone_invalid: "সঠিক বাংলাদেশি নম্বর লিখুন, যেমন 01XXXXXXXXX",
      email_invalid: "সঠিক email লিখুন",
      password_min: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে",
      password_max: "পাসওয়ার্ড খুব বড়",
      identifier_required: "Phone number বা email লিখুন",
      password_required: "পাসওয়ার্ড লিখুন",
      otp_length: "৬-ডিজিটের কোড লিখুন",
      invalid_input_restart: "তথ্য ঠিক নয়। আবার শুরু করুন।",
    },
  },
}
