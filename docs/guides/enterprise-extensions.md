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
2. `lib/ee/registry.ts` holds the currently active hooks, starting from the
   no-op defaults. `registerEnterpriseHooks()` lets a module override any
   subset of them; `getEnterpriseHooks()` is what OSS code calls to read
   them. The active hooks live on `globalThis` rather than a plain
   module-scope variable — Next.js compiles `instrumentation.ts` (where
   registration happens once at boot) and the request-handling/SSR bundles
   (where hooks are read) into separate chunks, each with its own
   independent copy of this module, so a plain module-scope variable set in
   one would never be visible from the other. `globalThis` is the one thing
   guaranteed to be shared across all of them within the same process.
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
3. Keep hook return values plain, serializable data (strings, numbers,
   plain objects/arrays) — never component/function references. Most call
   sites (like the sidebar) read the hook in a Server Component and pass
   the result as a prop into a Client Component; React only allows
   component references across that boundary when the bundler itself
   tagged them as Client Components, which never happens for anything
   loaded from a runtime `import()` of an external package. This is why
   `NavExtension.icon` is a lucide icon *name* (resolved from a small
   allow-list in `components/app-shell.tsx`) rather than a component.
4. Add a test in `tests/lib/ee/` covering the default no-op and an
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
        { id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: 'ShieldCheck' },
      ],
    })
  },
}

export default enterpriseModule
```

To wire it into a real deployment:

1. **Don't** add `@codeplans/enterprise` to this repo's tracked
   `package.json`/`pnpm-lock.yaml` — not even as an `optionalDependency`.
   `pnpm install --frozen-lockfile` (what CI and most deploy platforms use)
   requires every dependency in `package.json` to already have a matching
   entry in the lockfile; since nobody without access to the private repo
   can generate that entry, committing the dependency breaks CI and any
   contributor's install the moment the lockfile needs regenerating for an
   unrelated reason. `optionalDependencies` only protects a plain
   `pnpm install`, not `--frozen-lockfile`.
2. Instead, have the commercial deployment's own build pipeline place the
   package into `node_modules/@codeplans/enterprise` as a step outside of
   pnpm's dependency resolution — e.g. its Dockerfile/CI checks out
   `codeplans-enterprise` (with credentials that do have access) and copies
   or `pnpm link`s it into `node_modules` before `next build` runs.
   `lib/ee/load.ts` only needs the package to exist in `node_modules` at
   runtime; it doesn't care how it got there, and this keeps the OSS repo's
   lockfile fully resolvable by anyone.
3. Set `ENTERPRISE_ENABLED=true` in that deployment's environment only.
4. Any page/route backed by an enterprise-only feature should still live
   behind its own check (e.g. `config`-style flag or a dedicated hook) so it
   degrades gracefully — a 404 or an upsell placeholder, not a crash — when
   the package isn't present.
