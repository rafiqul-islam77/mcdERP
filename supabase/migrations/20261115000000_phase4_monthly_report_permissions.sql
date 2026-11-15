-- =============================================================================
-- Migration: 20261115000000_phase4_monthly_report_permissions.sql
-- Description: Phase 4 Monthly Report granular export permissions.
-- =============================================================================

INSERT INTO public.permissions (key, module, page, action, label, description) VALUES
  -- Monthly Report general permission keys
  ('monthly_report.view', 'monthly_report', 'monthly_report', 'view', 'Monthly Report - View', 'View monthly needle reports'),
  ('monthly_report.export_excel', 'monthly_report', 'monthly_report', 'export_excel', 'Monthly Report - Export Excel', 'Export monthly needle report to Excel'),
  ('monthly_report.export_pdf', 'monthly_report', 'monthly_report', 'export_pdf', 'Monthly Report - Export PDF', 'Export monthly needle report to PDF'),
  ('monthly_report.print', 'monthly_report', 'monthly_report', 'print', 'Monthly Report - Print', 'Print monthly needle report'),

  -- Running Needle (needle): Monthly Report granular
  ('needle.monthly_report.export_excel', 'needle', 'monthly_report', 'export_excel', 'Needle Monthly Report - Export Excel', 'Export needle monthly report to Excel'),
  ('needle.monthly_report.export_pdf', 'needle', 'monthly_report', 'export_pdf', 'Needle Monthly Report - Export PDF', 'Export needle monthly report to PDF'),

  -- New Needle (broken): Monthly Report granular
  ('broken.monthly_report.export_excel', 'broken', 'monthly_report', 'export_excel', 'New Needle Monthly Report - Export Excel', 'Export new needle monthly report to Excel'),
  ('broken.monthly_report.export_pdf', 'broken', 'monthly_report', 'export_pdf', 'New Needle Monthly Report - Export PDF', 'Export new needle monthly report to PDF'),

  -- Idle Needle (idle): Monthly Report granular
  ('idle.monthly_report.export_excel', 'idle', 'monthly_report', 'export_excel', 'Idle Needle Monthly Report - Export Excel', 'Export idle needle monthly report to Excel'),
  ('idle.monthly_report.export_pdf', 'idle', 'monthly_report', 'export_pdf', 'Idle Needle Monthly Report - Export PDF', 'Export idle needle monthly report to PDF')
ON CONFLICT (key) DO NOTHING;

-- Grant all permissions to Site Admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
  AND p.key IN (
    'monthly_report.view',
    'monthly_report.export_excel',
    'monthly_report.export_pdf',
    'monthly_report.print',
    'needle.monthly_report.export_excel',
    'needle.monthly_report.export_pdf',
    'broken.monthly_report.export_excel',
    'broken.monthly_report.export_pdf',
    'idle.monthly_report.export_excel',
    'idle.monthly_report.export_pdf'
  )
ON CONFLICT DO NOTHING;
