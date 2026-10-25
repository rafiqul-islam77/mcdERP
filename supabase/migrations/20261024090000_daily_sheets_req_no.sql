-- Migration: 20261024090000_daily_sheets_req_no.sql
-- Description: Add req_no column to needle_daily_sheets for floor-level daily requisition tracking

ALTER TABLE public.needle_daily_sheets
ADD COLUMN IF NOT EXISTS req_no TEXT;
