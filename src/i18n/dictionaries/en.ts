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

  auth: {
    signInTitle: "Sign in",
    signInDesc: "Use the phone number or email you registered with.",
    identifierLabel: "Phone or email",
    identifierPlaceholder: "01XXXXXXXXX or you@email.com",
    passwordLabel: "Password",
    forgotPassword: "Forgot password?",
    signingIn: "Signing in…",
    newHere: "New here?",
    createAccount: "Create an account",

    registerTitle: "Create your account",
    registerDesc: "Register with your phone and email. We send a verification code to your email.",
    nameLabel: "Name",
    namePlaceholder: "Your name",
    phoneLabel: "Phone number",
    emailLabel: "Email",
    passwordPlaceholder: "At least 8 characters",
    confirmPassword: "Confirm password",
    sendingCode: "Sending code…",
    devCodeHint: "Dev mode: use code 123456",
    enterCodeTitle: "Enter the code",
    sentCodeTo: "We sent a 6-digit code to {email}.",
    codeLabel: "Verification code",
    verifying: "Verifying…",
    verifyAndCreate: "Verify and create account",
    changeDetails: "Change details",
    resendCode: "Resend code",
    alreadyHaveAccount: "Already have an account?",

    resetTitle: "Reset your password",
    resetDesc: "Enter the email you registered with. If it has an account, we will send a verification code.",
    sentCodeResetTo: "We sent a 6-digit code to {email}. Enter it and choose a new password.",
    sendCode: "Send code",
    newPassword: "New password",
    confirmNewPassword: "Confirm new password",
    saving: "Saving…",
    setNewPassword: "Set new password",
    useDifferentEmail: "Use a different email",
    rememberedIt: "Remembered it?",
    backToSignIn: "Back to sign in",

    onboardingTitle: "Set up your profile",
    onboardingDesc: "A couple of details so teams and players can find you.",
    displayName: "Display name",
    positionLabel: "Position (optional)",
    skillLabel: "Skill (optional)",
    areaLabel: "Area (optional)",
    positionPlaceholder: "e.g. MID",
    skillPlaceholder: "e.g. Intermediate",
    areaPlaceholder: "e.g. Dhanmondi, Dhaka",
    yourLocation: "Your location",
    locationHelp:
      "Set your location so nearby matches can find you. We only store an approximate spot (within ~100m), never your exact address.",

    ownATurfTitle: "Own a turf?",
    ownATurfDesc: "How turf owners get their account on Turfkoi.",
    ownerStep1Title: "We list your turf",
    ownerStep1Body:
      "Turf accounts are set up by invitation. The Turfkoi team adds your turf to the platform first.",
    ownerStep2Title: "You receive a claim link",
    ownerStep2Body:
      "The Turfkoi team sends you a personal link by WhatsApp or email. It stays valid for 14 days.",
    ownerStep3Title: "Open the link, then register or sign in",
    ownerStep3Body:
      "Create your account on this page, or sign in if you already have one. You will be taken straight back to your turf.",
    ownerStep4Title: "Press Claim turf",
    ownerStep4Body: "That makes you the owner. You will set up slots, pricing, and photos next.",
    ownerHelpNote:
      "No link yet? Apply to list your turf — the Turfkoi team reviews every application and reaches out with next steps.",
    listYourTurf: "List your turf",
    passwordsNoMatch: "Passwords do not match",

    errors: {
      invalid_credentials: "Wrong phone/email or password.",
      rate_limited: "Too many attempts. Wait a bit and try again.",
      signin_failed: "Could not sign you in. Try again in a moment.",
      phone_taken: "That phone number already has an account.",
      email_taken: "That email already has an account.",
      phone_taken_just: "That phone number was just registered. Sign in instead.",
      email_taken_just: "That email was just registered. Sign in instead.",
      signin_failed_created: "Account created, but sign-in failed. Try signing in.",
      send_failed: "Could not send the email right now. Please try again.",
      invalid: "Wrong code. Try again.",
      consumed: "This code was already used. Request a new one.",
      expired: "That code expired. Request a new one.",
      locked: "Too many attempts. Try again in 15 minutes.",
      invalid_email: "Enter a valid email address.",
      name_short: "Name is too short",
      name_max: "Name is too long",
      phone_invalid: "Enter a valid Bangladeshi number, e.g. 01XXXXXXXXX",
      email_invalid: "Enter a valid email address",
      password_min: "Password must be at least 8 characters",
      password_max: "Password is too long",
      identifier_required: "Enter your phone number or email",
      password_required: "Enter your password",
      otp_length: "Enter the 6-digit code",
      invalid_input_restart: "Invalid input. Start again.",
    },
  },
}

export type Dictionary = typeof en
