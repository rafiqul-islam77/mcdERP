/**
 * Permission key constants for the GMS Needle Management ERP.
 * Matches the permission keys seeded in migration 20241001000003_roles_permissions.sql.
 */
export const PERMISSIONS = {
  DASHBOARD: {
    VIEW: 'dashboard.view',
  },

  DAILY_REPORT: {
    VIEW: 'daily_report.view',
    EXPORT_STOCK_EXCEL: 'daily_report.export_stock_excel',
    EXPORT_PRESENT_EXCEL: 'daily_report.export_present_excel',
    EXPORT_PDF: 'daily_report.export_pdf',
    PRINT: 'daily_report.print',
  },

  NEEDLE: {
    DAILY_ENTRY: {
      VIEW: 'needle.daily_entry.view',
      CREATE: 'needle.daily_entry.create',
      EDIT: 'needle.daily_entry.edit',
      DELETE: 'needle.daily_entry.delete',
      EXPORT: 'needle.daily_entry.export',
      PRINT: 'needle.daily_entry.print',
      RUNNING: 'needle.daily_entry.running',
      NEW: 'needle.daily_entry.new',
      IDLE: 'needle.daily_entry.idle',
    },
    DAILY_REPORT: {
      VIEW: 'needle.daily_report.view',
      EXPORT: 'needle.daily_report.export',
      EXPORT_STOCK_EXCEL: 'needle.daily_report.export_stock_excel',
      EXPORT_PRESENT_EXCEL: 'needle.daily_report.export_present_excel',
      EXPORT_PDF: 'needle.daily_report.export_pdf',
      PRINT: 'needle.daily_report.print',
    },
    MONTHLY_REPORT: {
      VIEW: 'needle.monthly_report.view',
      EXPORT: 'needle.monthly_report.export',
      PRINT: 'needle.monthly_report.print',
    },
  },

  BROKEN: {
    DAILY_ENTRY: {
      VIEW: 'broken.daily_entry.view',
      CREATE: 'broken.daily_entry.create',
      EDIT: 'broken.daily_entry.edit',
      DELETE: 'broken.daily_entry.delete',
      EXPORT: 'broken.daily_entry.export',
      PRINT: 'broken.daily_entry.print',
    },
    DAILY_REPORT: {
      VIEW: 'broken.daily_report.view',
      EXPORT: 'broken.daily_report.export',
      EXPORT_STOCK_EXCEL: 'broken.daily_report.export_stock_excel',
      EXPORT_PRESENT_EXCEL: 'broken.daily_report.export_present_excel',
      EXPORT_PDF: 'broken.daily_report.export_pdf',
      PRINT: 'broken.daily_report.print',
    },
    MONTHLY_REPORT: {
      VIEW: 'broken.monthly_report.view',
      EXPORT: 'broken.monthly_report.export',
      PRINT: 'broken.monthly_report.print',
    },
  },

  IDLE: {
    DAILY_ENTRY: {
      VIEW: 'idle.daily_entry.view',
      CREATE: 'idle.daily_entry.create',
      EDIT: 'idle.daily_entry.edit',
      DELETE: 'idle.daily_entry.delete',
      EXPORT: 'idle.daily_entry.export',
      PRINT: 'idle.daily_entry.print',
    },
    DAILY_REPORT: {
      VIEW: 'idle.daily_report.view',
      EXPORT: 'idle.daily_report.export',
      EXPORT_STOCK_EXCEL: 'idle.daily_report.export_stock_excel',
      EXPORT_PRESENT_EXCEL: 'idle.daily_report.export_present_excel',
      EXPORT_PDF: 'idle.daily_report.export_pdf',
      PRINT: 'idle.daily_report.print',
    },
    MONTHLY_REPORT: {
      VIEW: 'idle.monthly_report.view',
      EXPORT: 'idle.monthly_report.export',
      PRINT: 'idle.monthly_report.print',
    },
  },

  NEEDLE_MANAGEMENT: {
    NEEDLE: {
      VIEW: 'needle_management.needle.view',
      CREATE: 'needle_management.needle.create',
      EDIT: 'needle_management.needle.edit',
      DELETE: 'needle_management.needle.delete',
    },
    IDEAL_NEEDLE: {
      VIEW: 'needle_management.ideal_needle.view',
      CREATE: 'needle_management.ideal_needle.create',
      EDIT: 'needle_management.ideal_needle.edit',
      DELETE: 'needle_management.ideal_needle.delete',
    },
    IDLE_NEEDLE: {
      VIEW: 'needle_management.ideal_needle.view',
      CREATE: 'needle_management.ideal_needle.create',
      EDIT: 'needle_management.ideal_needle.edit',
      DELETE: 'needle_management.ideal_needle.delete',
    },
  },

  REPORT_STUDIO: {
    REGULAR: {
      VIEW: 'report_studio.regular.view',
      EXPORT: 'report_studio.regular.export',
    },
    CUSTOM: {
      VIEW: 'report_studio.custom.view',
      CREATE: 'report_studio.custom.create',
      EDIT: 'report_studio.custom.edit',
      DELETE: 'report_studio.custom.delete',
      EXPORT: 'report_studio.custom.export',
    },
  },

  LOCATION: {
    FLOORS: {
      VIEW: 'admin.floors.view',
      CREATE: 'admin.floors.create',
      EDIT: 'admin.floors.edit',
    },
    FLOOR_LOCATIONS: {
      VIEW: 'admin.floor_locations.view',
      CREATE: 'admin.floor_locations.create',
      EDIT: 'admin.floor_locations.edit',
    },
  },

  ADMIN: {
    USERS: {
      VIEW: 'admin.users.view',
      CREATE: 'admin.users.create',
      EDIT: 'admin.users.edit',
      DISABLE: 'admin.users.disable',
      RESET_CREDENTIALS: 'admin.users.reset_credentials',
      VIEW_TOKEN: 'admin.users.view_token',
    },
    ROLES: {
      VIEW: 'admin.roles.view',
      CREATE: 'admin.roles.create',
      EDIT: 'admin.roles.edit',
      DELETE: 'admin.roles.delete',
    },
    DESIGNATIONS: {
      VIEW: 'admin.designations.view',
      CREATE: 'admin.designations.create',
      EDIT: 'admin.designations.edit',
    },
    FLOORS: {
      VIEW: 'admin.floors.view',
      CREATE: 'admin.floors.create',
      EDIT: 'admin.floors.edit',
    },
    FLOOR_LOCATIONS: {
      VIEW: 'admin.floor_locations.view',
      CREATE: 'admin.floor_locations.create',
      EDIT: 'admin.floor_locations.edit',
    },
    AUDIT: {
      VIEW: 'admin.audit.view',
    },
    SETTINGS: {
      VIEW: 'admin.settings.view',
      EDIT: 'admin.settings.edit',
    },
  },

  PROFILE: {
    VIEW: 'profile.view',
    EDIT: 'profile.edit',
  },
} as const

type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
  ? { [K in keyof T]: LeafValues<T[K]> }[keyof T]
  : never

export type PermissionKey = LeafValues<typeof PERMISSIONS>
