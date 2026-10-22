'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, UserPlus, Copy, Check, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createEmployeeAction } from '@/app/actions/employees'
import { useToast } from '@/components/ui/toast'
import type { Floor, Designation, Role } from '@/types'

export function AddEmployeeClient({
  floors,
  designations,
  roles,
}: {
  floors: Floor[]
  designations: Designation[]
  roles: Role[]
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]> | undefined>()
  const [selectedFloorIds, setSelectedFloorIds] = React.useState<string[]>([])

  const allFloorsSelected = floors.length > 0 && selectedFloorIds.length === floors.length

  const handleFloorToggle = (id: string) => {
    setSelectedFloorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleToggleAllFloors = () => {
    if (allFloorsSelected) {
      setSelectedFloorIds([])
    } else {
      setSelectedFloorIds(floors.map((f) => f.id))
    }
  }

  // Result with token
  const [createdResult, setCreatedResult] = React.useState<{
    tokenPlaintext: string
    employeeId: string
    name: string
  } | null>(null)
  const [copied, setCopied] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (selectedFloorIds.length === 0) {
      setFieldErrors({ floor_ids: ['Please select at least one floor.'] })
      return
    }

    setLoading(true)
    setError(null)
    setFieldErrors(undefined)

    const formData = new FormData(e.currentTarget)
    formData.delete('floor_ids')
    selectedFloorIds.forEach((id) => formData.append('floor_ids', id))
    if (selectedFloorIds.length > 0) {
      formData.set('floor_id', selectedFloorIds[0])
    }

    const res = await createEmployeeAction(formData)

    setLoading(false)

    if (res.success && res.data) {
      setCreatedResult(res.data)
      toast('Employee registered successfully', 'success')
    } else {
      setError(res.error || 'Failed to create employee.')
      setFieldErrors(res.fieldErrors)
    }
  }

  const handleCopy = () => {
    if (!createdResult) return
    navigator.clipboard.writeText(createdResult.tokenPlaintext)
    setCopied(true)
    toast('Activation token copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-surface-border">
        <Link
          href="/administration/employees"
          className="p-1.5 rounded-erp text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink">Add New Employee</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Register a factory team member and generate a secure activation token.
          </p>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-3.5 rounded-erp bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Success Modal / Banner Showing Token (§21) */}
      {createdResult ? (
        <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2 text-success font-bold text-base">
            <CheckCircle2 className="w-6 h-6 text-success" />
            Employee Registered & Activation Token Generated!
          </div>

          <div className="p-5 bg-surface-muted rounded-erp-lg border border-surface-border text-center space-y-3">
            <p className="text-xs text-ink-muted font-semibold uppercase tracking-wider">
              {createdResult.employeeId} • {createdResult.name}
            </p>

            <div className="text-3xl font-mono font-black text-brand tracking-widest select-all py-1">
              {createdResult.tokenPlaintext}
            </div>

            <p className="text-xs text-ink-muted max-w-md mx-auto">
              Provide this one-time activation token to the employee. They will visit the login page and click &quot;First Time Login&quot; to set their password.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied to Clipboard' : 'Copy Token'}
            </Button>

            <Button onClick={() => router.push('/administration/employees')}>
              View in Employee Roster →
            </Button>
          </div>
        </div>
      ) : (
        /* Employee Registration Form (§21) */
        <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Employee ID */}
              <div>
                <Input
                  label="Employee ID *"
                  name="employee_id"
                  placeholder="e.g. EMP-001"
                  required
                  className="uppercase font-mono font-semibold"
                  error={fieldErrors?.employee_id?.[0]}
                  hint="Unique official company staff ID"
                />
              </div>

              {/* Full Name */}
              <div>
                <Input
                  label="Full Name *"
                  name="name"
                  placeholder="e.g. Rahim Ahmed"
                  required
                  error={fieldErrors?.name?.[0]}
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <Input
                label="Official Email Address *"
                name="email"
                type="email"
                placeholder="e.g. rahim.ahmed@gms-composite.com"
                required
                error={fieldErrors?.email?.[0]}
                hint="Used internally for secure Supabase Auth identity"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              {/* Designation dropdown (§9) */}
              <div>
                <Select
                  label="Designation *"
                  name="designation_id"
                  required
                  error={fieldErrors?.designation_id?.[0]}
                >
                  <option value="">Select Designation...</option>
                  {designations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Role dropdown (§10) */}
              <div>
                <Select
                  label="Role *"
                  name="role_id"
                  required
                  error={fieldErrors?.role_id?.[0]}
                >
                  <option value="">Select Role...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.is_system ? '(System)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Floor Selection Checkbox Area (§8) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
                  Assigned Floors <span className="text-danger">*</span>
                  <span className="ml-2 font-normal text-ink-muted lowercase">
                    ({selectedFloorIds.length} of {floors.length} selected)
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleToggleAllFloors}
                  className="text-xs font-medium text-brand hover:underline cursor-pointer"
                >
                  {allFloorsSelected ? 'Clear All' : 'Select All Floors'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-erp border border-surface-border bg-slate-50/50">
                {floors.map((f) => {
                  const isChecked = selectedFloorIds.includes(f.id)
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-2.5 p-2 rounded-erp border transition-all cursor-pointer text-xs font-medium select-none ${
                        isChecked
                          ? 'bg-brand/5 border-brand/40 text-brand font-semibold shadow-xs'
                          : 'bg-white border-surface-border text-ink hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={f.id}
                        checked={isChecked}
                        onChange={() => handleFloorToggle(f.id)}
                        className="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="truncate">{f.code ? `${f.code} - ${f.name}` : f.name}</span>
                    </label>
                  )
                })}
              </div>
              {fieldErrors?.floor_ids && (
                <p className="text-xs text-danger mt-1">{fieldErrors.floor_ids[0]}</p>
              )}
            </div>

            <div className="pt-4 border-t border-surface-border flex justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/administration/employees')}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={loading}
                loadingText="Registering..."
                className="gap-1.5 shadow-sm"
              >
                <UserPlus className="w-4 h-4" />
                <span>Register Employee</span>
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
