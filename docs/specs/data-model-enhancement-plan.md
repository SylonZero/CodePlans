# Data Model Enhancement Plan: Assets & Team Collaboration

> **Status: SUPERSEDED** (2026-07). The core of this plan shipped: `assets`,
> `asset_dependencies`, `tasks.asset_id`, `code_plans.target_asset_ids`, and
> organization-level membership (`organization_members`). The proposed
> `product_members` (product-level roles) was **not adopted** — org-level roles are
> the access model; product-level membership is deferred as a possible hosted-tier
> feature. Next steps for the data model live in `docs/specs/design-spec-v3.md`.

## Overview

This document outlines the required changes to support product-to-component mapping and multi-user collaboration as specified in functional-spec-v2.md.

## Current State Analysis

### Issues with Current Model:
1. **Single ownership**: Products only have `owner_id` - no team collaboration
2. **Missing asset entities**: Tasks reference `asset_type` but no formal asset table
3. **No asset relationships**: Cannot model dependencies between components
4. **Restrictive security**: RLS policies only support single-user ownership
5. **No team management**: No concept of shared access or roles

## Proposed Changes

### 1. New Database Tables

#### Assets Table
```sql
CREATE TABLE public.assets (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('app', 'service', 'library', 'datastore', 'platform')),
  product_id UUID REFERENCES products(id),
  metadata JSONB DEFAULT '{}',
  repository_url TEXT,
  documentation_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'planned')),
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

**Purpose**: Represents individual components within products (apps, services, libraries, etc.)

#### Asset Dependencies Table
```sql
CREATE TABLE public.asset_dependencies (
  id UUID PRIMARY KEY,
  source_asset_id UUID REFERENCES assets(id),
  target_asset_id UUID REFERENCES assets(id),
  dependency_type TEXT CHECK (dependency_type IN ('depends_on', 'integrates_with', 'aggregates')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE
);
```

**Purpose**: Models relationships and dependencies between assets

#### Product Members Table
```sql
CREATE TABLE public.product_members (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  user_id UUID REFERENCES users(id),
  role TEXT CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE,
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

**Purpose**: Enables team collaboration with role-based access control

### 2. Enhanced Existing Tables

#### Tasks Table Enhancements
- Add `asset_id UUID` column to link tasks to specific assets
- Maintain existing `asset_type` for backward compatibility

#### Code Plans Table Enhancements  
- Add `target_assets UUID[]` column to specify which assets a plan targets

### 3. Updated Row-Level Security

#### New Access Control Function
```sql
CREATE FUNCTION user_has_product_access(product_id UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM product_members 
    WHERE product_id = $1 
    AND user_id = auth.uid()
    AND joined_at IS NOT NULL
    AND role_hierarchy_check(role, required_role)
  );
END;
$$
```

#### Role Hierarchy
- **Owner**: Full access (create, read, update, delete, manage team)
- **Editor**: Can modify content (create, read, update code plans/tasks/assets)
- **Viewer**: Read-only access

### 4. TypeScript Type Updates

#### New Types
```typescript
export type ComponentAssetType = 'app' | 'service' | 'library' | 'datastore' | 'platform';
export type DependencyType = 'depends_on' | 'integrates_with' | 'aggregates';
export type UserRole = 'owner' | 'editor' | 'viewer';

export interface Asset {
  id: string;
  name: string;
  type: ComponentAssetType;
  productId: string;
  // ... other fields
}

export interface ProductMember {
  id: string;
  productId: string;
  userId: string;
  role: UserRole;
  // ... other fields
}
```

## Migration Strategy

### Phase 1: Infrastructure (Database)
1. ✅ Create new tables: `assets`, `asset_dependencies`, `product_members`
2. ✅ Add columns to existing tables: `tasks.asset_id`, `code_plans.target_assets`
3. ✅ Migrate existing product owners to `product_members` table
4. ✅ Update RLS policies for team-based access

### Phase 2: Application Layer (Next.js)
1. Update TypeScript types to reflect new data model
2. Create data access functions for new entities
3. Update existing functions to handle team-based access
4. Create UI components for team management

### Phase 3: Feature Implementation
1. Asset management UI (CRUD operations)
2. Asset dependency visualization  
3. Team invitation and role management
4. Updated product/plan creation flows

## Security Considerations

### Data Isolation
- Each product's data is isolated by team membership
- Users can only access products they're members of
- Role-based permissions prevent unauthorized modifications

### Invitation System
- Users are invited to products with specific roles
- Invitations must be accepted before granting access
- Invitations can be revoked by product owners

### RLS Policy Updates
- Policies check team membership instead of direct ownership
- Hierarchical role checking (owners > editors > viewers)
- Secure functions prevent privilege escalation

## Example Use Cases

### CodePlans Product Structure
```
CodePlans Product
├── Web App (this repo)
│   ├── Depends on: Supabase Backend
│   └── Integrates with: Stripe API
├── Supabase Backend  
│   ├── Depends on: PostgreSQL Database
│   └── Integrates with: Stripe API
├── PostgreSQL Database
└── Future Mobile App
    └── Depends on: Supabase Backend
```

### Team Collaboration Scenarios
1. **Product Owner**: Creates product, invites team members
2. **Senior Developer** (Editor): Creates code plans, manages assets
3. **Junior Developer** (Viewer): Views plans and tasks, cannot modify
4. **External Contractor** (Editor): Limited time access, specific role

## Implementation Priority

### High Priority (Phase 1)
- [ ] Database migrations (005 & 006)
- [ ] Basic team membership functionality
- [ ] Updated RLS policies

### Medium Priority (Phase 2)  
- [ ] Asset management CRUD
- [ ] Team invitation system
- [ ] UI updates for team-based access

### Low Priority (Phase 3)
- [ ] Asset dependency visualization
- [ ] Advanced team management features
- [ ] Asset health and metadata tracking

## Backward Compatibility

### Existing Data
- All existing products automatically get their owner as a team member
- Existing tasks maintain `asset_type` field alongside new `asset_id`
- Existing code plans work without `target_assets` (empty array default)

### API Compatibility
- Existing API functions continue to work
- New team-based functions are additive
- Gradual migration path for UI components

## Risks and Mitigation

### Data Migration Risks
- **Risk**: Existing data corruption during migration
- **Mitigation**: Thorough testing, rollback plan, data validation

### Performance Risks  
- **Risk**: Complex RLS queries impact performance
- **Mitigation**: Proper indexing, query optimization, caching

### Security Risks
- **Risk**: Privilege escalation or data leaks
- **Mitigation**: Comprehensive RLS testing, security review

## Next Steps

1. **Review and approve** this enhancement plan
2. **Run database migrations** in development environment
3. **Test RLS policies** thoroughly with multiple user scenarios
4. **Update application code** to use new data model
5. **Implement team management UI**
6. **Deploy and monitor** in production

---

*This plan enables CodePlans to support complex product structures with multiple components and team collaboration while maintaining security and data integrity.*