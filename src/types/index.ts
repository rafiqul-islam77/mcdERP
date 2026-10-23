// ─── Core ERP Types ──────────────────────────────────────────────────────────

export type AccountState =
  | 'pending_activation'
  | 'active'
  | 'credential_reset_required'
  | 'disabled'

export type TokenPurpose = 'activation' | 'recovery'

export type TokenStatus = 'active' | 'used' | 'revoked' | 'expired'

export type OnlineStatus = 'live' | 'offline'

export type PasswordStatus = 'not_set' | 'active' | 'reset_required'

// ─── Database row types ───────────────────────────────────────────────────────

export interface Profile {
  id: string
  employee_id: string
  name: string
  email: string
  designation_id: string | null
  role_id: string | null
  floor_id: string | null
  floor_ids?: string[] | null
  account_state: AccountState
  must_set_password: boolean
  last_login_at: string | null
  last_seen_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ProfileWithRelations extends Profile {
  designations: Pick<Designation, 'id' | 'name' | 'code'> | null
  roles: Pick<Role, 'id' | 'name' | 'is_system'> | null
  floors: Pick<Floor, 'id' | 'name' | 'code'> | null
  assigned_floors?: Pick<Floor, 'id' | 'name' | 'code'>[]
}

export interface FloorLocation {
  id: string
  code: string | null
  name: string
  description: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Floor {
  id: string
  code: string | null
  name: string
  floor_location_id?: string | null
  description: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  floor_locations?: Pick<FloorLocation, 'id' | 'name' | 'code'> | null
}

export interface Designation {
  id: string
  code: string | null
  name: string
  description: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  is_system: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface Permission {
  id: string
  key: string
  module: string | null
  page: string | null
  action: string | null
  label: string | null
  description: string | null
}

export interface RolePermission {
  role_id: string
  permission_id: string
}

export interface UserAccessToken {
  id: string
  user_id: string
  token_encrypted: string | null
  token_fingerprint: string | null
  purpose: TokenPurpose
  status: TokenStatus
  expires_at: string | null
  used_at: string | null
  revoked_at: string | null
  created_by: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_user_id: string | null
  target_user_id: string | null
  event_type: string
  entity_type: string | null
  entity_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ─── Application types ────────────────────────────────────────────────────────

export interface CurrentUser {
  id: string
  email: string
  profile: ProfileWithRelations
  permissions: string[]
  isSiteAdmin: boolean
}

export interface EmployeeRow {
  id: string
  employee_id: string
  name: string
  email: string
  designation: string | null
  role: string | null
  floor: string | null
  floor_ids?: string[]
  account_state: AccountState
  must_set_password: boolean
  last_login_at: string | null
  last_seen_at: string | null
  has_active_token: boolean
  role_is_system: boolean
}

export interface PermissionGroup {
  module: string
  label: string
  pages: PermissionPage[]
}

export interface PermissionPage {
  page: string
  label: string
  permissions: Permission[]
}

export interface SidebarItem {
  key: string
  label: string
  href?: string
  icon: string
  permission?: string
  children?: SidebarItem[]
}

// ─── Action result types ──────────────────────────────────────────────────────

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
  fieldErrors?: Record<string, string[]>
  message?: string
}

export type TokenRevealResult = {
  token: string
  purpose: TokenPurpose
  expiresAt: string | null
}

// ─── Needle Master Types ──────────────────────────────────────────────────────

export type NeedleGroup = 'needle' | 'ideal_needle'

export interface NeedleItem {
  id: string
  description_item: string
  item_code: string
  tac_inventory_item_code: string | null
  needle_type: string
  size_dia: string | null
  brand: string
  unit_price_bdt: number | null
  unit_price_usd: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface NeedleFloorAssignment {
  id: string
  needle_item_id: string
  floor_id: string
  created_at: string
  updated_at: string
}

export interface NeedleRowItem {
  id: string // item_id or temp draft id
  item_id: string
  description_item: string
  item_code: string
  tac_inventory_item_code: string | null
  needle_type: string
  size_dia: string
  brand: string
  unit_price_bdt: number | null
  unit_price_usd: number | null
  active: boolean
  floor_ids: string[] // Array of assigned floor IDs (multiple floor selection)
  floor_id?: string | null // For single floor backwards compatibility
  floor_name?: string | null
  floor_code?: string | null
  location_name?: string | null
  needle_group: NeedleGroup
  is_draft?: boolean
}

// ─── Audit event types ────────────────────────────────────────────────────────

export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DISABLED'
  | 'USER_ENABLED'
  | 'ACTIVATION_TOKEN_CREATED'
  | 'ACTIVATION_TOKEN_REVEALED'
  | 'ACTIVATION_COMPLETED'
  | 'RECOVERY_TOKEN_CREATED'
  | 'RECOVERY_TOKEN_REVEALED'
  | 'CREDENTIAL_RESET_REQUIRED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'ROLE_CREATED'
  | 'ROLE_UPDATED'
  | 'ROLE_DELETED'
  | 'ROLE_PERMISSIONS_UPDATED'
  | 'DESIGNATION_CREATED'
  | 'DESIGNATION_UPDATED'
  | 'FLOOR_CREATED'
  | 'FLOOR_UPDATED'
  | 'FLOOR_LOCATION_CREATED'
  | 'FLOOR_LOCATION_UPDATED'
  | 'PROFILE_UPDATED'
  | 'NEEDLE_CREATED'
  | 'NEEDLE_UPDATED'
  | 'NEEDLE_DELETED'
  | 'NEEDLE_FLOOR_ASSIGNED'
  | 'NEEDLE_FLOOR_REMOVED'
  | 'IDEAL_NEEDLE_CREATED'
  | 'IDEAL_NEEDLE_UPDATED'
  | 'IDEAL_NEEDLE_DELETED'
  | 'IDEAL_NEEDLE_FLOOR_ASSIGNED'
  | 'IDEAL_NEEDLE_FLOOR_REMOVED'
