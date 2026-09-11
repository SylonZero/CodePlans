# Enterprise extension points

CodePlans is MIT-licensed and every feature that ships in this repo is
available to everyone. Some commercial/hosted-only features are built as a
**separate, private package** that this app loads optionally — so the
community edition has zero build-time or run-time dependency on closed-source
code, and a plain clone/build of this repo never needs it.

This document describes the mechanism, not any specific proprietary feature.

## How it works

1. `lib/ee/types.ts` defines `EnterpriseHooks` — a small, additive interface
   of extension points. Every hook has a no-op default (`[]`, `null`, a
   pass-through), so behavior is identical whether or not an enterprise
   module is installed.
2. `lib/ee/registry.ts` holds the currently active hooks in memory, starting
   from the no-op defaults. `registerEnterpriseHooks()` lets a module
   override any subset of them; `getEnterpriseHooks()` is what OSS code calls
   to read them.
3. `lib/ee/load.ts` runs once per server boot, from `instrumentation.ts`. If
   `ENTERPRISE_ENABLED=true`, it attempts to `import('@codeplans/enterprise')`
   and call its `register(registerEnterpriseHooks)` export. If the package
   isn't installed (the default for the community edition), the import
   rejects and is swallowed — the app logs a warning and continues normally.
4. `next.config.mjs` lists `@codeplans/enterprise` in `serverExternalPackages`
   so Next.js never tries to trace or bundle it at build time. Combined with
   step 3's env-driven, non-literal import specifier, a community build
   never fails just because the private package is absent.

```
lib/ee/types.ts      → EnterpriseHooks interface + shared types
lib/ee/registry.ts   → register/get the active hooks (in-memory)
lib/ee/load.ts        → conditionally loads @codeplans/enterprise at boot
instrumentation.ts    → calls loadEnterpriseModule() once per server boot
```

## Consuming a hook from OSS code

Call `getEnterpriseHooks()` and use the result directly — never import the
private package itself. For example, the dashboard sidebar renders whatever
`navItems()` returns, appended after the built-in navigation
(`app/(dashboard)/layout.tsx` → `components/app-shell.tsx`):

```ts
import { getEnterpriseHooks } from '@/lib/ee/registry'

const extraNavItems = getEnterpriseHooks().navItems() // [] unless enabled
```

## Adding a new extension point

1. Add a narrowly-scoped field to `EnterpriseHooks` in `lib/ee/types.ts`,
   with a no-op default value in `lib/ee/registry.ts`.
2. Call `getEnterpriseHooks().yourHook(...)` from the one or two places in
   the OSS codebase that need it. Keep the call site itself simple — all
   proprietary logic belongs in the private package, not here.
3. Add a test in `tests/lib/ee/` covering the default no-op and an
   overridden case, following `registry.test.ts`.

## The private package contract

A private `@codeplans/enterprise` package only needs to export a default
object matching `EnterpriseModule` from `lib/ee/types.ts`:

```ts
// @codeplans/enterprise's entry point
import type { EnterpriseModule } from '@codeplans/types' // or duplicated locally

const enterpriseModule: EnterpriseModule = {
  register(register) {
    register({
      navItems: () => [
        { id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: ShieldIcon },
      ],
    })
  },
}

export default enterpriseModule
```

To wire it into a real deployment:

1. Add it as an optional dependency once the private repo exists, e.g.
   `"@codeplans/enterprise": "github:your-org/codeplans-enterprise#main"` in
   `optionalDependencies` (not `dependencies` — this keeps `pnpm install`
   succeeding for everyone who doesn't have access to the private repo).
2. Set `ENTERPRISE_ENABLED=true` in that deployment's environment only.
3. Any page/route backed by an enterprise-only feature should still live
   behind its own check (e.g. `config`-style flag or a dedicated hook) so it
   degrades gracefully — a 404 or an upsell placeholder, not a crash — when
   the package isn't present.
