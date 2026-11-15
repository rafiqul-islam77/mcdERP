-- Migration: Rename "Running Needle" display labels to "Regular Needle"
-- Strictly labels/descriptions only. No keys, IDs, transaction data, or business logic are altered.

UPDATE public.permissions
SET label = 'Regular Needle - Daily Report View',
    description = 'Permission to view Regular Needle Daily Present Balance Report'
WHERE key = 'needle.daily_report.view';

UPDATE public.permissions
SET label = 'Regular Needle - Monthly Report View',
    description = 'Permission to view Regular Needle Monthly Consumption Report'
WHERE key = 'needle.monthly_report.view';

UPDATE public.permissions
SET label = 'Daily Entry - Regular Category',
    description = 'Permission to enter regular needle daily transactions'
WHERE key = 'needle.daily_entry.running';

UPDATE public.system_settings
SET description = 'Document identification number for Regular Needle Present Balance reports'
WHERE setting_key = 'daily_report.running.document_no';

UPDATE public.system_settings
SET description = 'Document version number for Regular Needle Present Balance reports'
WHERE setting_key = 'daily_report.running.version_no';
