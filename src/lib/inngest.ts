import { Inngest } from "inngest"

/**
 * Durable background jobs (audit G3). Functions registered here as features
 * land: slot-hold expiry, settle-at-kickoff (money flow), weekly payouts,
 * notification dispatch.
 */
export const inngest = new Inngest({ id: "turfkoi" })
