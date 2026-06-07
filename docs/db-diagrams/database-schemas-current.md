The SQL statements for the current database in Supabase are below:

```SQL
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.account_conversions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  organization_id uuid,
  conversion_type text NOT NULL CHECK (conversion_type = ANY (ARRAY['individual_to_team'::text, 'team_to_individual'::text, 'plan_upgrade'::text, 'plan_downgrade'::text])),
  from_plan text,
  to_plan text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT account_conversions_pkey PRIMARY KEY (id),
  CONSTRAINT account_conversions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT account_conversions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.asset_dependencies (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  source_asset_id uuid NOT NULL,
  target_asset_id uuid NOT NULL,
  dependency_type text NOT NULL DEFAULT 'depends_on'::text CHECK (dependency_type = ANY (ARRAY['depends_on'::text, 'integrates_with'::text, 'aggregates'::text])),
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT asset_dependencies_pkey PRIMARY KEY (id),
  CONSTRAINT asset_dependencies_source_asset_id_fkey FOREIGN KEY (source_asset_id) REFERENCES public.assets(id),
  CONSTRAINT asset_dependencies_target_asset_id_fkey FOREIGN KEY (target_asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.assets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type = ANY (ARRAY['app'::text, 'service'::text, 'library'::text, 'datastore'::text, 'platform'::text])),
  product_id uuid NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  repository_url text,
  documentation_url text,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text, 'planned'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT assets_pkey PRIMARY KEY (id),
  CONSTRAINT assets_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.code_plans (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL DEFAULT 'feature'::text CHECK (type = ANY (ARRAY['feature'::text, 'enhancement'::text, 'bugfix'::text])),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'draft'::text, 'closed'::text])),
  product_id uuid NOT NULL,
  due_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  target_assets ARRAY DEFAULT '{}'::uuid[],
  owner_id uuid NOT NULL,
  CONSTRAINT code_plans_pkey PRIMARY KEY (id),
  CONSTRAINT code_plans_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id),
  CONSTRAINT code_plans_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.invitation_tokens (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  invitation_id uuid NOT NULL,
  token_hash text NOT NULL,
  used_at timestamp with time zone,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT invitation_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT invitation_tokens_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.invitations(id)
);
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  email text NOT NULL,
  invitation_type text NOT NULL CHECK (invitation_type = ANY (ARRAY['organization'::text, 'product'::text])),
  target_id uuid NOT NULL,
  role text NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  rejected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  invitation_message text,
  reminder_sent_at timestamp with time zone,
  reminder_count integer DEFAULT 0,
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);
CREATE TABLE public.organization_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])),
  invited_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  joined_at timestamp with time zone,
  invited_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT organization_members_pkey PRIMARY KEY (id),
  CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT organization_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);
CREATE TABLE public.organization_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL UNIQUE,
  allow_member_invites boolean DEFAULT true,
  require_email_verification boolean DEFAULT true,
  allowed_domains ARRAY,
  max_members integer DEFAULT '-1'::integer,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT organization_settings_pkey PRIMARY KEY (id),
  CONSTRAINT organization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  avatar_url text,
  plan_tier text NOT NULL DEFAULT 'free'::text CHECK (plan_tier = ANY (ARRAY['free'::text, 'pro'::text, 'team'::text])),
  billing_email text,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.product_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'viewer'::text CHECK (role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])),
  invited_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  joined_at timestamp with time zone,
  invited_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT product_members_pkey PRIMARY KEY (id),
  CONSTRAINT product_members_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT product_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT product_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text NOT NULL,
  color text NOT NULL DEFAULT 'blue'::text CHECK (color = ANY (ARRAY['blue'::text, 'green'::text, 'purple'::text, 'red'::text, 'yellow'::text, 'orange'::text, 'pink'::text, 'gray'::text])),
  owner_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  organization_id uuid,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id),
  CONSTRAINT products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  plan_tier text NOT NULL DEFAULT 'free'::text CHECK (plan_tier = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text])),
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  renewal_date timestamp with time zone,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  organization_id uuid,
  billing_type text DEFAULT 'individual'::text CHECK (billing_type = ANY (ARRAY['individual'::text, 'organization'::text])),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text NOT NULL,
  asset_type text NOT NULL DEFAULT 'ui'::text CHECK (asset_type = ANY (ARRAY['ui'::text, 'backend'::text, 'database'::text, 'api'::text, 'infrastructure'::text, 'testing'::text, 'documentation'::text])),
  status text NOT NULL DEFAULT 'todo'::text CHECK (status = ANY (ARRAY['todo'::text, 'in-progress'::text, 'review'::text, 'done'::text])),
  assignee text,
  estimated_hours integer,
  code_plan_id uuid NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  asset_id uuid,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id),
  CONSTRAINT tasks_code_plan_id_fkey FOREIGN KEY (code_plan_id) REFERENCES public.code_plans(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  name text,
  avatar_url text,
  billing_status text DEFAULT 'free'::text CHECK (billing_status = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_beta_tester boolean DEFAULT false,
  is_alpha_tester boolean DEFAULT false,
  feature_flags jsonb DEFAULT '{}'::jsonb,
  primary_organization_id uuid,
  account_type text DEFAULT 'individual'::text CHECK (account_type = ANY (ARRAY['individual'::text, 'organization'::text])),
  email text,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT users_primary_organization_id_fkey FOREIGN KEY (primary_organization_id) REFERENCES public.organizations(id)
);
```