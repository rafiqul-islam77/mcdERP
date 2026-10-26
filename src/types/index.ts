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

export type NeedleEntryType = 'new' | 'running'

export interface NeedleFloorAssignment {
  id: string
  needle_item_id: string
  floor_id: string
  needle_group?: NeedleGroup
  entry_type?: NeedleEntryType
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
  floor_ids: string[] // Array of assigned floor IDs (multiple floor selection, used by Idle Needle)
  new_floor_ids?: string[] // Floors assigned for NEW needle entries (Normal Needle)
  running_floor_ids?: string[] // Floors assigned for RUNNING needle entries (Normal Needle)
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
  | 'NEEDLE_DAILY_RECEIVE_SAVED'
  | 'NEEDLE_DAILY_ISSUE_SAVED'
  | 'NEEDLE_DAILY_BNR_SAVED'
  | 'NEEDLE_DAILY_TRANSFER_EXECUTED'
  | 'NEEDLE_DAILY_SHEET_CREATED'

// ─── Daily Entry Types (Phase 2.1) ──────────────────────────────────────────

export type DailyEntryCategory = 'NEW' | 'RUNNING' | 'IDLE'

export type DailyTransactionType =
  | 'OPENING'
  | 'RECEIVE'
  | 'ISSUE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'

export interface DailySheet {
  id: string
  entry_date: string
  floor_id: string
  category: DailyEntryCategory
  status: 'draft' | 'posted' | 'closed'
  req_no?: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface NeedleTransaction {
  id: string
  transaction_date: string
  floor_id: string
  needle_item_id: string
  transaction_type: DailyTransactionType
  quantity: number
  req_no: string | null
  daily_sheet_id: string | null
  notes: string | null
  client_operation_id?: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface NeedleBNRRecord {
  id: string
  record_date: string
  daily_sheet_id: string | null
  floor_id: string
  needle_item_id: string
  category: DailyEntryCategory
  quantity: number
  client_operation_id?: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface DailyEntryRowItem {
  needle_item_id: string
  item_code: string
  needle_type: string
  size_dia: string | null
  brand: string
  previous: number
  received: number
  delivery: number
  present: number
  bnr: number
  req_no: string | null
  transfer_in: number
  transfer_out: number
  last_transfer_note?: string | null
  is_stock_known?: boolean
}



export interface PendingSyncOperation {
  id: string
  client_operation_id: string
  sheet_key: string
  user_id: string
  entry_date: string
  floor_id: string
  category: DailyEntryCategory
  needle_item_id: string
  field: 'received' | 'delivery' | 'bnr'
  value: number
  req_no?: string | null
  status: 'pending' | 'syncing' | 'failed' | 'conflict'
  retry_count: number
  error?: string | null
  created_at: number
  updated_at: number
  last_attempt_at?: number | null
}

export interface LocalDailySheetDraft {
  sheet_key: string
  user_id: string
  entry_date: string
  floor_id: string
  category: DailyEntryCategory
  cells: Record<string, { received?: number; delivery?: number; bnr?: number; req_no?: string | null }>
  updated_at: number
}

export interface CachedMasterNeedleItem {
  id: string
  item_code: string
  needle_type: string
  size_dia: string
  brand: string
  active: boolean
  updated_at: number
}

export interface CachedFloorAssignment {
  id: string // `${floor_id}:${category}:${needle_item_id}`
  floor_id: string
  needle_item_id: string
  category: DailyEntryCategory
  active: boolean
  updated_at: number
}

export interface CachedSheetSnapshot {
  sheet_key: string // `${user_id}:${date}:${floor_id}:${category}`
  user_id: string
  entry_date: string
  floor_id: string
  category: DailyEntryCategory
  rows: DailyEntryRowItem[]
  requisition_no: string | null
  updated_at: number
}

export interface CachedMasterMeta {
  user_id: string
  authorized_floor_ids: string[]
  allowed_categories: DailyEntryCategory[]
  floors: Floor[]
  all_active_floors: Floor[]
  cached_combinations: string[] // list of `${floor_id}:${category}`
  cached_at: number
  version: number
}

export interface AuthorizedMasterCatalogData {
  userId: string
  authorizedFloorIds: string[]
  allowedCategories: DailyEntryCategory[]
  floors: Floor[]
  allActiveFloors: Floor[]
  normalItems: {
    id: string
    item_code: string
    needle_type: string
    size_dia: string
    brand: string
    active: boolean
  }[]
  idleItems: {
    id: string
    item_code: string
    needle_type: string
    size_dia: string
    brand: string
    active: boolean
  }[]
  normalAssignments: {
    floor_id: string
    needle_item_id: string
    entry_type: 'new' | 'running'
  }[]
  idleAssignments: {
    floor_id: string
    needle_item_id: string
  }[]
  cachedAt: number
}

export interface StockBaselineRecord {
  id: string // `${floor_id}:${category}:${needle_item_id}`
  floor_id: string
  category: DailyEntryCategory
  needle_item_id: string
  baseline_date: string // ISO date string YYYY-MM-DD
  balance: number
  updated_at: number
}

export interface StockMovementRecord {
  id: string // transaction UUID
  transaction_date: string
  floor_id: string
  category: DailyEntryCategory
  needle_item_id: string
  transaction_type: DailyTransactionType
  quantity: number
  req_no?: string | null
  updated_at: number
}

export interface CachedSheetHeader {
  id: string // `${floor_id}:${category}:${entry_date}`
  floor_id: string
  category: DailyEntryCategory
  entry_date: string
  req_no: string | null
  status: string
  updated_at: number
}

export type CacheSyncStatus = 'syncing' | 'complete' | 'failed' | 'stale'

export interface DailyStockSnapshotRecord {
  id: string // `${floor_id}:${category}:${date}:${needle_item_id}`
  date: string // YYYY-MM-DD
  floor_id: string
  category: DailyEntryCategory
  needle_item_id: string
  previous: number
  received: number
  delivery: number
  transfer_in: number
  transfer_out: number
  adjustment_in: number
  adjustment_out: number
  present: number
  bnr: number
  req_no: string | null
  last_transfer_note: string | null
  server_updated_at: number
  sync_batch_id: string
}

export interface StockCacheCoverageRecord {
  id: string // `${user_id}:${floor_id}:${category}`
  user_id: string
  floor_id: string
  category: DailyEntryCategory
  coverage_start: string // YYYY-MM-DD
  coverage_end: string // YYYY-MM-DD
  sync_batch_id?: string
  record_count?: number
  needle_count?: number
  last_successful_sync_at: number
  sync_status: CacheSyncStatus
}

export interface OfflineStockHistorySyncData {
  userId: string
  syncBatchId?: string
  windowStartDate: string
  windowEndDate: string
  targetFloorIds: string[]
  categories: DailyEntryCategory[]
  snapshots?: DailyStockSnapshotRecord[]
  baselines: StockBaselineRecord[]
  movements: StockMovementRecord[]
  sheets: CachedSheetHeader[]
  assignedNeedleCounts?: Record<string, number>
  syncedAt: number
  isIncremental?: boolean
}



