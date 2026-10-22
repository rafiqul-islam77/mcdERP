# GMS Needle Management ERP — Phase 1 Foundation

> **Phase 1 Foundation Only**: Enterprise Resource Planning system for GMS Composite Knitting Industries Ltd. Needle Warehouse Management. Built with Next.js 15 App Router, TypeScript (strict mode), Supabase (PostgreSQL), and Tailwind CSS.

---

## 1. System Overview

This repository contains **Phase 1** of the GMS Needle Management ERP. It delivers the foundational infrastructure, identity and authentication pipelines, role-based access control (RBAC), factory master data (Floors, Designations, Roles), audit logging, and realtime presence tracking.

### Phase Boundaries
- **IN SCOPE (Phase 1)**:
  - Employee ID authentication (no email login exposed to users)
  - Single-use encrypted token pipeline (`XXXX-XXXX`) for Activation and Password Recovery
  - AES-256-GCM token encryption at rest
  - Granular RBAC permission system with multi-module permission matrices
  - Site Admin system role protection (cannot be deleted, disabled, or locked out)
  - Dynamic permission-driven navigation sidebar
  - Realtime Online/Offline user presence tracking (Supabase Realtime Presence + Heartbeat)
  - Factory Master Data: Floors, Designations, Roles & Permission Matrix
  - Full employee roster management with credential resetting and token reveal
  - Immutable audit trail recording all security and administrative operations
  - Protected placeholder routes for all Phase 2 modules

- **OUT OF SCOPE (Deferred to Phase 2)**:
  - Needle stock tracking and physical inventory calculation
  - Broken needle inspection and exchange workflow
  - Idle machine needle monitoring
  - Dynamic Custom Report Studio and Excel generator

---

## 2. Technology Architecture

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router with Server Actions) |
| **Language** | TypeScript (Strict mode, zero `any` leaks) |
| **Database** | PostgreSQL via Supabase |
| **Auth** | Supabase Auth + Custom Employee ID resolver |
| **Encryption** | Node.js `crypto` AES-256-GCM (server-side only) |
| **Styling** | Tailwind CSS (adapted corporate dark/light ERP theme) |
| **Icons** | Lucide React |
| **Validation** | Zod |

---

## 3. Directory Structure

```
├── scripts/
│   ├── bootstrap-admin.ts         # CLI script to create the first Site Admin
│   └── generate-encryption-key.ts # Generates 256-bit AES hex key
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/             # Employee ID + password sign-in
│   │   │   ├── activate/          # First-time account activation via token
│   │   │   └── recover/           # Account credential recovery via token
│   │   ├── (protected)/
│   │   │   ├── dashboard/         # Executive overview with Phase 2 KPI cards
│   │   │   ├── administration/
│   │   │   │   ├── employees/     # Staff roster, filter by floor/role/status
│   │   │   │   ├── roles/         # Role catalog and permission matrix editor
│   │   │   │   ├── floors/        # Factory floor master data CRUD
│   │   │   │   ├── designations/  # Staff job titles and ranks
│   │   │   │   └── audit/         # Immutable security event audit trail
│   │   │   ├── profile/           # Personal profile and self-service password
│   │   │   ├── needle/            # Phase 2 placeholder routes (daily-entry, reports)
│   │   │   ├── broken-needle/     # Phase 2 placeholder routes
│   │   │   ├── idle-needle/       # Phase 2 placeholder routes
│   │   │   └── report-studio/     # Phase 2 placeholder routes
│   │   ├── actions/               # Server Actions (auth, employees, roles, floors)
│   │   ├── api/auth/              # OAuth callback and presence heartbeat endpoints
│   │   ├── layout.tsx             # Root HTML layout with Inter font
│   │   ├── middleware.ts          # Edge route authentication guard
│   │   └── unauthorized/          # Access denied (403) page
│   ├── components/
│   │   ├── admin/                 # TokenReveal, ResetCredentialsModal, EmployeeTable
│   │   ├── layout/                # AppShell, dynamic Sidebar, Header
│   │   ├── presence/              # Supabase Realtime PresenceProvider
│   │   └── ui/                    # Button, Badge, Modal, Input, Select, Pagination, Toast
│   ├── lib/
│   │   ├── audit/                 # Secure append-only audit logger
│   │   ├── auth/                  # Server auth guards and Employee ID resolution
│   │   ├── encryption/            # AES-256-GCM token encryption/decryption
│   │   ├── permissions/           # Permission key catalog and evaluation engine
│   │   ├── presence/              # Realtime Presence channel join/track
│   │   ├── supabase/              # Browser, Server, and Admin client factories
│   │   ├── tokens/                # Token generator, verifier, and consumer
│   │   └── validation/            # Zod validation schemas
│   └── types/
│       └── index.ts               # Complete TypeScript types and interfaces
├── supabase/
│   ├── migrations/                # Database migrations 001 to 005
│   ├── config.toml                # Local Supabase CLI configuration
│   └── seed.sql                   # Roles, sample floors/designations seed data
└── demo/                          # Preserved legacy HTML/JS reference files
```

---

## 4. Setup and Installation

### Prerequisites
- Node.js 18.18+ or 20+
- Supabase CLI or hosted Supabase project

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Environment Configuration
Create `.env.local` based on `.env.example`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
TOKEN_ENCRYPTION_KEY=
APP_URL=http://localhost:3000
```

### Step 3: Generate Token Encryption Key
Run the encryption key generator to obtain a secure 64-character hexadecimal key (AES-256-GCM):
```bash
npm run generate-key
```
Copy the printed `TOKEN_ENCRYPTION_KEY` into your `.env.local` file.

### Step 4: Run Database Migrations
If using local Supabase:
```bash
npx supabase start
npx supabase db reset
```
If using hosted Supabase, execute the SQL files in `supabase/migrations/` sequentially in the Supabase SQL Editor:
1. `20241001000001_profiles.sql`
2. `20241001000002_master_data.sql`
3. `20241001000003_roles_permissions.sql`
4. `20241001000004_tokens.sql`
5. `20241001000005_audit.sql`
6. `20241001000006_profile_floor_ids.sql`

Then run `supabase/seed.sql` to populate initial master data and permissions.

If the ERP database is already set up and reports a missing `profiles.floor_ids`
column, run only `supabase/migrations/20241001000006_profile_floor_ids.sql` in SQL
Editor. It preserves existing floor assignments and can be rerun safely. Do not
rerun `combined_migration.sql` on an initialized database; that file includes
initial triggers, policies, and Site Admin creation.

### Step 5: Bootstrap the First Site Admin
Initialize the primary Site Admin account:
```bash
npm run bootstrap-admin
```
The script will prompt for Employee ID (e.g. `EMP-001`), Name, and Email, create the Supabase Auth user, assign the protected `Site Admin` role, and print a **one-time activation token** (valid for 72 hours).

### Step 6: Start the Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000/activate`, enter your Employee ID and the printed activation token, and set your password.

---

## 5. Security & Authentication Model

### Employee ID Login
- Staff sign in using their **Employee ID** and password.
- No email addresses are exposed on the login form. The server securely maps the Employee ID to the registered Supabase Auth account internally.

### One-Time Token Pipeline
- Tokens are formatted as `XXXX-XXXX` (8 uppercase alphanumeric characters with no ambiguous glyphs).
- **Encryption at Rest**: Tokens are encrypted using AES-256-GCM (`iv:authTag:ciphertext`) before database insertion. Plaintext tokens are **never stored** in the database.
- **Constant-Time Verification**: Verification uses `crypto.timingSafeEqual` to eliminate timing attack vectors.
- **Destruction on Use**: Once an activation or recovery token is redeemed, its encrypted value is nullified (`token_encrypted = NULL`) and marked `status = 'used'`.

### Site Admin Protection
- The `Site Admin` role has `is_system = true`.
- It cannot be deleted or disabled.
- The system prevents disabling, deleting, or stripping admin permissions from the final active Site Admin.
- The Site Admin role is permanently granted access to all system permissions.

---

## 6. Verification and Build Status

- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
- **Linting**: `npm run lint` (`next lint`) passes with 0 errors.
- **Production Build**: `npm run build` compiles and pre-renders all 29 routes successfully.
