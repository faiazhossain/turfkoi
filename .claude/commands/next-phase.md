---
description: Implement the next undone build phase from docs/PHASES.md
---

Read `docs/PHASES.md`. Determine the next phase to work on:
- If any phase is marked `[~]` (in progress), resume it.
- Otherwise, implement the first phase marked `[ ]`.

Do NOT redo any phase already marked `[x]`.

Implement that phase following the "Universal rules" and that phase's scope
in `docs/PHASES.md`. Read the files it tells you to read first (README.md,
AUDIT_DECISIONS.md, src/db/schema/, the relevant src/lib/ stub and src/app/
routes). Use the project's existing patterns — do not introduce new conventions.

If the work would benefit from planning a non-trivial implementation, plan it
and confirm the approach with the user before writing lots of code.

When finished:
1. Run the verification commands from the file
   (`npm run lint`, `npm run typecheck`, `npm run build`, and
   `npm run db:generate` if the schema changed). All must pass.
2. Update `docs/PHASES.md`: mark the phase `[x]` (or `[~]` if genuinely partial).
3. Commit the work with a conventional commit message, including the checklist
   update. Do not push unless the user asks.

If a new product decision arises that is NOT already resolved in
`AUDIT_DECISIONS.md`, STOP and ask the user before proceeding — they prefer to
discuss nuanced decisions in dialogue rather than pick from menus.

## When every phase is `[x]` (the build is complete)

Run this final routine instead of implementing another phase:

1. Tell the user: "All phases are complete — the Turfkoi build is done."
2. Create `docs/FEATURES.md`: product documentation of everything Turfkoi now
   does, organized by role (player / team / turf-owner / admin), covering the
   money flow, phone+OTP auth, matchmaking, and the tech stack. Base it on the
   ACTUAL built code (read the routes, schema, and features), not on the
   original spec — describe what exists, including any decisions that diverged.
3. Update `README.md`: remove the "Continuing the build" section and the
   phase-by-phase roadmap; replace them with a concise "Features" overview that
   links to `docs/FEATURES.md`.
4. Remove the now-obsolete build scaffolding: delete `docs/PHASES.md` and
   `.claude/commands/next-phase.md` (this command file).
5. Commit with a message like `docs: finalize project documentation (build complete)`.
   Do not push unless asked.
