@AGENTS.md

## Loading State Requirement

The project uses the approved project loader design (`src/components/ui/loader.tsx`: `Loader` for inline/button use, `LoaderOverlay` for full-screen route loading; animation defined in `globals.css` under `.app-loader`).

Never invent, replace, or introduce a different spinner/loader design unless explicitly instructed by the project owner.

Whenever implementing or modifying:

- Buttons
- Forms
- API calls
- Mutations
- Server Actions
- Navigation
- Pages
- Sections
- Modals
- Drawers
- Search
- Autocomplete
- Uploads
- CRUD operations
- Authentication
- Any asynchronous user interaction

always evaluate whether a loading state is required.

Rules:

- Use the approved `Loader` component. The shared `Button` accepts a `loading` prop that renders it, sets `aria-busy`, and disables the button — prefer it over manual spinner markup.
- Prefer localized loading states (button/section) over global loading states. Route-level loading goes through Next.js `loading.tsx` (`LoaderOverlay`) plus `RouteTransitionOverlay` (click-triggered full-screen feedback for navigations that `loading.tsx` skips, e.g. prefetched/blocked transitions); do not build another global mechanism.
- Skeletons (`LoadingState`) remain valid for content-heavy layouts; never add a competing spinner next to them.
- Prevent duplicate submissions while operations are running (keep disable-on-pending behavior).
- Every loading state must correctly terminate on success, error, validation failure, cancellation, navigation, and component unmount.
- Before completing any task, audit the asynchronous interactions introduced or modified by that task and ensure appropriate loading feedback exists.
- Do not create a new loader/spinner when the existing approved loader can be reused.
