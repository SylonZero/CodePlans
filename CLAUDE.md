# CodePlans

## `/refs` folder

`/refs` contains reference code for UI mockups (currently `refs/code-plans-ai`), built
with React/Next.js. It is gitignored and is **not part of the app** — do not import
from it, build it, or run it.

When a prompt references `/refs`:
- Treat it as a **loose UX guide**: layout, interaction patterns, component structure,
  and how state changes (e.g. selections/filters) affect what's displayed.
- It's reasonable to **port over styling and component structure** (Tailwind classes,
  component composition) where it fits this project's conventions, but adapt it to
  this project's actual data model, routing, and state management rather than
  copying verbatim.
- Don't treat it as a source of truth for data shapes, API routes, or backend logic —
  those must follow this project's `lib/db` schema and existing query patterns.
