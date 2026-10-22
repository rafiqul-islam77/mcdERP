'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createRoleAction } from '@/app/actions/roles'
import { useToast } from '@/components/ui/toast'

export default function NewRolePage() {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const res = await createRoleAction(formData)

    setLoading(false)

    if (res.success && res.data) {
      toast('Role created! Now configure permissions.', 'success')
      router.push(`/administration/roles/${res.data.id}`)
    } else {
      setError(res.error || 'Failed to create role.')
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-surface-border">
        <Link
          href="/administration/roles"
          className="p-1.5 rounded-erp text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink">Create New Role</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Define a new security role and proceed to configure its permission matrix.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-erp bg-danger/10 border border-danger/20 text-danger text-xs font-medium">
          {error}
        </div>
      )}

      <div className="bg-white border border-surface-border rounded-erp-xl shadow-erp p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              label="Role Name *"
              name="name"
              placeholder="e.g. Needle Floor Supervisor"
              required
              hint="Must be distinct from existing roles"
            />
          </div>

          <div>
            <Input
              label="Role Description"
              name="description"
              placeholder="e.g. Oversees daily issuance and broken needle reconciliation"
            />
          </div>

          <div className="pt-4 border-t border-surface-border flex justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/administration/roles')}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              loadingText="Creating Role..."
              className="gap-1.5 shadow-sm"
            >
              <ShieldPlus className="w-4 h-4" />
              <span>Create Role & Configure Matrix →</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
