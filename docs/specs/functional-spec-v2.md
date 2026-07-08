# Code Plans v2 — Functional Specification

> **Status: SUPERSEDED** (2026-07). This spec described an earlier `src/`-based
> codebase and feature set (Calendar, org pages, product-level invitations, account
> conversion wizard) that does not match the current app. It is kept for historical
> context only. See `docs/app-spec.md` for the implemented state and
> `docs/specs/design-spec-v3.md` for the target design and roadmap.

## Purpose

**Code Plans** is a system designed to help engineering teams manage and track coordinated sets of changes across a software system's architecture. A Code Plan spans changes across assets such as services, applications, libraries, and infrastructure components. The platform integrates AI to assist with effort estimation, tech debt analysis, and codebase insights.

It is designed for teams operating in modern service-oriented or monorepo-based environments and helps manage complexity, ensure delivery visibility, and reduce coordination friction.

---

## Conceptual Model

### Products

A **Product** represents a customer-facing system or platform. A product may include multiple components:

- **Apps**: User-facing UIs (web apps, mobile apps)
- **Services**: Backend APIs, microservices, or daemons
- **Libraries**: Shared or reusable internal packages
- **Datastores**: Databases, caches, messaging systems
- **Platforms**: 3rd-party integrations or hosted services (e.g. Stripe, S3)

Products are the top-level units in the CodePlans system and group related assets under a single planning boundary.

### Assets

Assets are individual units that can be targeted by a change or code plan. Each asset belongs to a product and is typed:

- `app`, `service`, `library`, `datastore`, or `platform`

Each asset can be:
- Tagged with metadata (e.g. backend, auth, UX)
- Annotated with AI-assessed health (tech debt, complexity)
- Linked to other assets via dependency or aggregation relationships

### Code Plans

A **Code Plan** is a container for coordinating a set of related changes. It includes:

- Related `tasks` grouped under a common goal
- Target `product` and `assets`
- Metadata: tags, type of change, effort estimate, schedule
- Schedule attributes: start date, end date, deadline
- Status: Draft, Active, Completed, Cancelled

Supported change types:
- Refactor
- New Feature
- Improvement (UI/UX/performance)
- Bug Fix

Code Plans enable filtering, sorting, and display by type, asset, tag, and contributor.

Code Plans support operations:
- Create / Edit / Delete
- Activate or Archive a Code Plan
- Track progress via task completion

---

## Functional Modules & Status

| Module                    | Description                                              | Status       | Location / Notes                                        |
|---------------------------|----------------------------------------------------------|--------------|---------------------------------------------------------|
| Authentication & Profiles | Supabase auth + user profile storage + password change  | Implemented  | `src/app/auth/*`, `src/lib/auth-*`, `src/middleware.ts` |
| Dashboard                | View of product and plan metrics with dark mode         | Implemented  | `src/app/page.tsx`, `getDashboardStats()`              |
| Product Management       | CRUD for products/assets with dark mode forms           | Implemented  | `CreateProductForm.tsx`, `createProductAction`         |
| Code Plan Management     | CRUD for code plans with dark mode support              | Implemented  | `CreateCodePlanForm.tsx`, `createCodePlan`             |
| Task Management          | Task CRUD and progress tracking                         | Implemented  | `TaskManagement.tsx`, `createTaskAction`               |
| Feature Flags            | Gated rollouts + navigation filtering                   | Implemented  | `FeatureFlag*`, `useFeatureFlags`, navigation system   |
| Dark Mode Support        | Comprehensive theming with user preference persistence  | Implemented  | `AppLayout.tsx`, `globals.css`, all components         |
| Analytics                | Dashboards and AI-based analytics                       | UI Stub      | `src/app/analytics/page.tsx` (Alpha feature)           |
| Billing & Subscription   | Stripe billing, usage limits                            | Planned      | `billing/page.tsx`, Supabase `subscriptions`           |
| Team Collaboration       | Organization accounts with shared billing               | Implemented  | `docs/team-accounts-design.md`, `lib/organizations.ts` |
| Settings/Profile         | User profile management with Alpha features             | Implemented  | `profile/page.tsx`, `ProfileForm.tsx`                 |
| Help / Diagnostics       | Dev help and debugging with dark mode                   | Implemented  | `help/page.tsx`, `diag/page.tsx`                       |
| Supabase Data Layer      | Typed access to backend data                            | Implemented  | `database.ts`, `migrations/`                           |
| Server Actions           | Secure action wrappers                                  | Implemented  | `actions.ts`                                            |
| AI Assistance            | Code analysis and estimation                            | Planned      | (future AI services)                                   |

---

## Module Details

### Authentication & User Profiles
**Data Needs**:
- Email, password (Supabase auth)
- Display name, avatar URL
- Feature access (beta/alpha/tester flags)
- Billing tier, access levels

**Operations**:
- Sign up / Sign in / Sign out
- Edit profile
- Set or revoke feature flags
- Fetch current user context (client/server)

---

### Dashboard
**Data Needs**:
- Count of products, active code plans, completed tasks
- Plan velocity (tasks completed per week)
- Per-product summaries

**Operations**:
- View dashboard cards
- Filter by team/product
- Fetch stats from backend API

---

### Product Management
**Data Needs**:
- Product name, slug
- Description
- Tags (optional)
- Creation date, creator ID

**Operations**:
- Create/Edit/Delete product
- View list of products
- Select active product context

---

### Code Plan Management
**Data Needs**:
- Plan title, description
- Target product ID
- Schedule (start, end, deadline)
- Tags, type (refactor, bug, etc.)
- Status: Draft, Active, Completed, Cancelled

**Operations**:
- Create/Edit/Delete plan
- Activate / Archive / Mark complete
- Assign tags and change schedule
- Filter/search plans

---

### Task Management
**Data Needs**:
- Task title, description
- Code plan ID, asset ID (optional)
- Status (Not started, In progress, Done)
- Tags, assignee, estimated effort

**Operations**:
- Add/edit/delete task
- Mark as complete / update status
- Assign to user / tag with metadata
- Link to GitHub PR (future)

---

### Feature Flags
**Data Needs**:
- Flag name, type (boolean, enum)
- Description, default tier
- Overrides per user

**Operations**:
- Toggle flag in dev admin UI
- Check feature flag at runtime
- Fetch flag registry

---

### Analytics
**Data Needs**:
- Aggregated stats from plans and tasks
- AI-derived effort estimation and throughput

**Operations**:
- View charts / dashboards (planned)
- Export data (future)

---

### Billing & Subscription
**Data Needs**:
- User ID, subscription tier
- Plan limits (products, plans, users)
- Stripe session & webhook metadata

**Operations**:
- View billing info
- Upgrade / downgrade plan
- Trigger Stripe session (checkout)

---

### Team Collaboration
**Data Needs**:
- Team ID, user membership
- Role (owner, editor, viewer)
- Shared access to products/plans

**Operations**:
- Invite user to team
- Change role or revoke access
- View team dashboard

---

### Settings / Profile
**Data Needs**:
- User profile
- Preferences and overrides
- Feature flag access levels

**Operations**:
- Update name, avatar, preferences
- Opt in/out of features
- Access Alpha features (Privacy & Security, Appearance)
- Manage account deletion (Danger Zone)
- Feature flag administration (for Alpha/Beta testers)

---

### Help / Diagnostics
**Data Needs**:
- Diagnostic logs (client/server)
- Help content (FAQ, markdown files)

**Operations**:
- View help pages
- Download diagnostics bundle (future)

---

### Supabase Data Layer
**Data Needs**:
- Typed access to tables (users, products, plans, tasks, flags)

**Operations**:
- Backend DB functions via typed methods
- Ensure schema migration alignment

---

### Server Actions
**Data Needs**:
- Wrappers for secure server functions

**Operations**:
- Create/edit entities securely
- Authorize user actions

---

### AI Assistance
**Data Needs**:
- Source code / metadata snapshots
- Task and plan descriptions
- Delivery history

**Operations**:
- Estimate task effort
- Analyze plan completion vs expected
- Generate missing todos
- Visualize asset relationships

---

## Authentication & User Profiles

Authentication is implemented via Supabase Auth (email/password). The `users` table stores:
- Name
- Avatar
- Billing tier
- Flags: alpha/beta-tester
- Per-feature overrides

Middleware protects private routes; helpers in `auth-client.ts` and `auth-server.ts` expose clients for use in server and browser.

### User Account Management

The user profile page (`/profile`) provides comprehensive account management features:

**Profile Information:**
- Update display name
- View account status (Free/Pro)
- View member since date
- Email address (read-only, contact support to change)

**Password Management:**
- Change password functionality with proper security validation
- Requires current password verification before allowing updates
- Password strength requirements (minimum 6 characters)
- Confirmation matching validation
- Real-time error handling and success feedback
- Form state management with loading indicators

**Security Features:**
- Current password verification through Supabase auth
- Secure password updates using Supabase's `updateUser` method
- Password visibility toggles for better UX
- Form validation and error handling
- Automatic form clearing on successful password change

---

## Team Accounts & Organizations

The platform supports both individual user accounts and team-based organization accounts with shared billing and centralized management.

### Account Types

**Individual Accounts:**
- Single user with personal billing
- Can collaborate on products via product-level invitations
- Direct ownership of products and subscriptions
- Can convert to organization account at any time

**Organization Accounts:**
- Multi-user teams with shared billing
- Centralized team management and settings
- Organization-owned products and resources
- Role-based access control (owner, admin, member)

### Organization Structure

**Organizations Table:**
- Unique slug-based URLs (`/org/company-name`)
- Plan tier management (free, pro, team)
- Stripe customer integration for team billing
- Organization metadata and branding

**Organization Members:**
- Role hierarchy: owner > admin > member
- Invitation workflow with email verification
- Join/leave functionality with audit trails
- Multiple users can have owner role for redundancy

**Organization Settings:**
- Member invitation controls
- Email domain restrictions for auto-join
- Maximum member limits based on plan
- Custom team preferences and configurations

### Billing Integration

**Individual Billing:** 
- User-specific Stripe customers and subscriptions
- Direct payment management by user
- Personal plan limits and features

**Organization Billing:**
- Organization-level Stripe customers
- Shared team subscriptions with per-seat pricing
- Billing managed by organization owners/admins
- Team-wide plan limits and features

### Account Conversion Flow

Users can convert individual accounts to organization accounts through a guided wizard:

1. **Organization Setup** - Name, slug, description, branding
2. **Billing Configuration** - Team plan selection, billing email
3. **Product Transfer** - Choose which products to transfer to organization
4. **Team Invitations** - Invite initial team members with roles
5. **Confirmation** - Review and execute conversion (atomic transaction)

### Permission Model

**Product Access:**
- Organization members can access organization-owned products
- Legacy product-level permissions maintained for backward compatibility
- Granular role-based permissions within organizations

**Billing Access:**
- Organization owners: Full billing management
- Organization admins: Read-only billing access  
- Organization members: No billing access

**Administrative Access:**
- Organization owners: Full organization management
- Organization admins: Member management, settings
- Organization members: Standard product access

### Migration Strategy

**Backward Compatibility:**
- All existing individual accounts continue to function unchanged
- Product-level team collaboration remains available
- Optional conversion to organization accounts
- No forced migrations or breaking changes

**Gradual Adoption:**
- Teams can start with individual accounts and product-level collaboration
- Convert to organization accounts when ready for centralized billing
- Mixed environments supported (some team members in org, others individual)

---

## Feature Flag System

Feature rollout is controlled by a granular system of flags:

- **Levels**: `production`, `public-beta`, `private-beta`, `alpha`
- **Registry**: `src/types/feature-flags.ts`
- **Runtime**: `useFeatureFlags` hook, `FeatureFlag` and `BetaFeature` components
- **Admin UI**: `FeatureFlagAdmin` component for dev use

### Navigation Feature Flags

The main application navigation now respects feature flags for progressive rollout:

| Navigation Item | Feature Flag Level | Access |
|-----------------|-------------------|---------|
| Dashboard | Production | All users |
| Analytics | Alpha | Alpha testers only |
| Products | Production | All users |
| Calendar | Alpha | Alpha testers only |
| Team | Private Beta | Beta testers only |
| Organization | Production | All users (when applicable) |
| Settings | Production | All users |
| Help | Production | All users |

**Implementation**: Navigation items are dynamically filtered based on user's feature flag access level, providing seamless progressive feature rollout.

---

## Dark Mode Support

The application provides comprehensive dark mode support with automatic theme detection and user preference persistence.

### Features

**Theme Toggle:**
- Header toggle button with Moon/Sun icons
- Positioned between notifications and user avatar
- Instant theme switching without page reload
- Tooltip indicators for current mode

**Theme Detection:**
- Automatic system preference detection on first visit
- localStorage persistence of user choice
- Respects `prefers-color-scheme` media query
- Graceful fallback to light mode

**Styling Implementation:**
- Tailwind CSS `dark:` prefix classes throughout
- Consistent color palette for dark theme
- Proper contrast ratios for accessibility
- Custom CSS for native browser controls (date pickers)

### Components with Dark Mode Support

**Core Layout:**
- ✅ AppLayout (sidebar, header, navigation, dropdown)
- ✅ All navigation items and states
- ✅ User avatar dropdown and menu items

**Dashboard & Analytics:**
- ✅ Stats cards and metrics displays
- ✅ Product cards and empty states
- ✅ Code plan cards and status badges
- ✅ Progress indicators and metadata

**Forms & Dialogs:**
- ✅ Product creation and editing forms
- ✅ Code plan creation and settings modals
- ✅ All input fields, textareas, and select elements
- ✅ Date picker controls and calendar widgets
- ✅ Form validation and error states

**Settings & Profile:**
- ✅ Settings page cards and sections
- ✅ Profile management forms
- ✅ Feature flag admin interface
- ✅ Account deletion panel (Danger Zone)
- ✅ Alpha/Beta feature cards with badges

**Organization Management:**
- ✅ Organization dashboard and stats
- ✅ Member list and role management
- ✅ Organization settings and billing tabs
- ✅ Team management interfaces

**Help & Support:**
- ✅ Help page cards and FAQ sections
- ✅ Contact options and support interfaces
- ✅ Documentation links and resources

### Technical Implementation

**CSS Strategy:**
- Tailwind `darkMode: 'class'` configuration
- CSS custom properties for consistent theming
- Webkit-specific styling for date input controls
- Component-level dark mode class application

**State Management:**
- React useState for theme toggle state
- localStorage for persistence across sessions
- useEffect hooks for initialization and system detection
- Document class manipulation for theme application

**Accessibility:**
- WCAG AA contrast ratios maintained
- Proper focus states in both themes
- Screen reader compatible theme indicators
- Keyboard navigation support preserved

---

## AI Roadmap (Planned)

- Parse codebases to extract state and generate snapshots
- Estimate effort per task or code plan
- Analyze delta between plan vs. delivered PRs
- Flag unaddressed tech debt and orphaned todos
- Suggest relationships between assets or components

---

## Pricing Notes

**Free Plan**:
- 1 Product (a full system boundary with apps, services, etc.)
- Up to N tasks and M Code Plans (TBD)

**Paid Plan (Pro / Team)**:
- Multiple products
- Team collaboration features
- Advanced AI assistance
- Custom billing tiers

---

## Personas and Use Cases

### Developer
- See todos grouped by plan for context
- Use AI effort estimates for planning
- Filter tasks by stack layer (frontend, backend, infra)
- Track tech debt and asset state

### Dev Manager
- Coordinate cross-service or cross-app changes
- Track actual delivery vs plan
- Flag incomplete items
- Measure velocity and timeline accuracy

### Architect
- Assess asset health across the system
- Model dependencies
- Ensure changes stay within architectural constraints

### QA Engineer
- Review planned changes for test coverage
- Link test cases to todos
- Understand cross-feature aggregations

### DBA
- Surface schema-affecting changes
- Review database-related plans
- Identify DB-layer tech debt

### DevOps
- Monitor changes affecting deployment or infra
- Tag infra-related work
- Visualize cross-env dependencies

---

## Appendix: Future Considerations

- Asset graph visualization
- Dependency impact simulation
- PR auto-linking to tasks
- AI-generated changelog and release planning
- GitHub / GitLab / Linear integration

