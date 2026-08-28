import { serve } from "inngest/next"

import { inngest, inngestFunctionsAll } from "@/lib/inngest"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctionsAll,
})
