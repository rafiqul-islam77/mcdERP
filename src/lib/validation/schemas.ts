import { z } from 'zod'

export const LoginSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required').trim(),
  password: z.string().min(1, 'Password is required'),
})

export const ActivateSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required').trim(),
  token: z.string().min(8, 'Token is required').trim(),
})

export const SetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your password'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const CreateEmployeeSchema = z
  .object({
    employee_id: z.string().min(1, 'Employee ID is required').trim().toUpperCase(),
    name: z.string().min(2, 'Full name is required').trim(),
    email: z.string().email('Valid email address is required').trim().toLowerCase(),
    designation_id: z.string().uuid('Please select a valid designation'),
    role_id: z.string().uuid('Please select a valid role'),
    floor_id: z.string().uuid().optional().nullable(),
    floor_ids: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => (data.floor_ids && data.floor_ids.length > 0) || Boolean(data.floor_id),
    {
      message: 'Please select at least one floor',
      path: ['floor_ids'],
    }
  )

export const UpdateEmployeeSchema = z
  .object({
    name: z.string().min(2, 'Full name is required').trim(),
    email: z.string().email('Valid email address is required').trim().toLowerCase(),
    designation_id: z.string().uuid('Please select a valid designation'),
    role_id: z.string().uuid('Please select a valid role'),
    floor_id: z.string().uuid().optional().nullable(),
    floor_ids: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => (data.floor_ids && data.floor_ids.length > 0) || Boolean(data.floor_id),
    {
      message: 'Please select at least one floor',
      path: ['floor_ids'],
    }
  )

export const FloorLocationSchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().min(1, 'Floor location name is required').trim(),
  description: z.string().optional(),
  active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
})

export const FloorSchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().min(1, 'Floor name is required').trim(),
  floor_location_id: z.string().uuid('Please select a valid floor location'),
  description: z.string().optional(),
  active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
})

export const DesignationSchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().min(1, 'Designation name is required').trim(),
  description: z.string().optional(),
  active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
})

export const RoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').trim(),
  description: z.string().optional(),
})

export const ProfileUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
})

export const NeedleItemSchema = z.object({
  id: z.string().uuid().optional(),
  description_item: z.string().min(1, 'Description item is required').default('GMTS SEWING NEEDLE'),
  item_code: z.string().min(1, 'Item code is required').trim().toUpperCase(),
  tac_inventory_item_code: z.string().trim().optional().nullable(),
  needle_type: z.string().min(1, 'Needle type is required').trim(),
  size_dia: z.string().min(1, 'Size/Dia is required').trim(),
  brand: z.string().min(1, 'Brand is required').trim(),
  unit_price_bdt: z.coerce.number().min(0, 'Unit Price BDT must be non-negative').default(0),
  unit_price_usd: z.coerce.number().min(0, 'Unit Price USD must be non-negative').default(0),
  floor_id: z.string().uuid().optional().nullable(),
  floor_ids: z.array(z.string().uuid()).optional().default([]),
  needle_group: z.enum(['needle', 'ideal_needle']).default('needle'),
  active: z.boolean().default(true),
})

export const NeedleInlineUpdateSchema = NeedleItemSchema.partial().extend({
  item_id: z.string().uuid(),
  floor_ids: z.array(z.string().uuid()).optional(),
  needle_group: z.enum(['needle', 'ideal_needle']),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type ActivateInput = z.infer<typeof ActivateSchema>
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>
export type FloorLocationInput = z.infer<typeof FloorLocationSchema>
export type FloorInput = z.infer<typeof FloorSchema>
export type DesignationInput = z.infer<typeof DesignationSchema>
export type RoleInput = z.infer<typeof RoleSchema>
export type NeedleItemInput = z.infer<typeof NeedleItemSchema>
export type NeedleInlineUpdateInput = z.infer<typeof NeedleInlineUpdateSchema>
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>
