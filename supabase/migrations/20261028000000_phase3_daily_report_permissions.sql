-- =============================================================================
-- Migration: 20261028000000_phase3_daily_report_permissions.sql
-- Description: Phase 3 Daily Report and Administration System Settings permissions.
-- =============================================================================

INSERT INTO public.permissions (key, module, page, action, label, description) VALUES
  -- Daily Report general permission keys
  ('daily_report.view', 'daily_report', 'daily_report', 'view', 'Daily Report - View', 'View daily needle reports'),
  ('daily_report.export_stock_excel', 'daily_report', 'daily_report', 'export_stock_excel', 'Daily Report - Export Stock Excel', 'Export daily stock report to Excel'),
  ('daily_report.export_present_excel', 'daily_report', 'daily_report', 'export_present_excel', 'Daily Report - Export Present Balance Excel', 'Export daily present balance report to Excel'),
  ('daily_report.export_pdf', 'daily_report', 'daily_report', 'export_pdf', 'Daily Report - Export PDF', 'Export daily present balance report to PDF'),
  ('daily_report.print', 'daily_report', 'daily_report', 'print', 'Daily Report - Print', 'Print daily present balance report'),

  -- Running Needle (needle): Daily Report granular
  ('needle.daily_report.export_stock_excel', 'needle', 'daily_report', 'export_stock_excel', 'Needle Daily Report - Export Stock Excel', 'Export needle daily stock report to Excel'),
  ('needle.daily_report.export_present_excel', 'needle', 'daily_report', 'export_present_excel', 'Needle Daily Report - Export Present Balance Excel', 'Export needle daily present balance report to Excel'),
  ('needle.daily_report.export_pdf', 'needle', 'daily_report', 'export_pdf', 'Needle Daily Report - Export PDF', 'Export needle daily present balance report to PDF'),

  -- New Needle (broken): Daily Report granular
  ('broken.daily_report.export_stock_excel', 'broken', 'daily_report', 'export_stock_excel', 'New Needle Daily Report - Export Stock Excel', 'Export new needle daily stock report to Excel'),
  ('broken.daily_report.export_present_excel', 'broken', 'daily_report', 'export_present_excel', 'New Needle Daily Report - Export Present Balance Excel', 'Export new needle daily present balance report to Excel'),
  ('broken.daily_report.export_pdf', 'broken', 'daily_report', 'export_pdf', 'New Needle Daily Report - Export PDF', 'Export new needle daily present balance report to PDF'),

  -- Idle Needle (idle): Daily Report granular
  ('idle.daily_report.export_stock_excel', 'idle', 'daily_report', 'export_stock_excel', 'Idle Needle Daily Report - Export Stock Excel', 'Export idle needle daily stock report to Excel'),
  ('idle.daily_report.export_present_excel', 'idle', 'daily_report', 'export_present_excel', 'Idle Needle Daily Report - Export Present Balance Excel', 'Export idle needle daily present balance report to Excel'),
  ('idle.daily_report.export_pdf', 'idle', 'daily_report', 'export_pdf', 'Idle Needle Daily Report - Export PDF', 'Export idle needle daily present balance report to PDF'),

  -- Administration: System Settings
  ('admin.settings.view', 'admin', 'settings', 'view', 'System Settings - View', 'View application system settings'),
  ('admin.settings.edit', 'admin', 'settings', 'edit', 'System Settings - Edit', 'Update application system settings')
ON CONFLICT (key) DO NOTHING;

-- Grant all permissions to Site Admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
  AND p.key IN (
    'daily_report.view',
    'daily_report.export_stock_excel',
    'daily_report.export_present_excel',
    'daily_report.export_pdf',
    'daily_report.print',
    'needle.daily_report.export_stock_excel',
    'needle.daily_report.export_present_excel',
    'needle.daily_report.export_pdf',
    'broken.daily_report.export_stock_excel',
    'broken.daily_report.export_present_excel',
    'broken.daily_report.export_pdf',
    'idle.daily_report.export_stock_excel',
    'idle.daily_report.export_present_excel',
    'idle.daily_report.export_pdf',
    'admin.settings.view',
    'admin.settings.edit'
  )
ON CONFLICT DO NOTHING;
