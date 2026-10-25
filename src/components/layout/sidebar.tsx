'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  AlertTriangle,
  Clock,
  FileBarChart,
  MapPin,
  Settings,
  User,
  LogOut,
  ChevronDown,
  ChevronRight,
  Layers,
} from 'lucide-react'
import type { CurrentUser } from '@/types'
import { logoutAction } from '@/app/actions/auth'

interface NavChild {
  label: string
  href: string
  permission: string
}

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  permission?: string
  children?: NavChild[]
}

export function Sidebar({
  user,
  isOpen,
  onClose,
}: {
  user: CurrentUser
  isOpen: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get('category')?.toUpperCase()
  const [navigatingTo, setNavigatingTo] = React.useState<string | null>(null)

  React.useEffect(() => {
    setNavigatingTo(null)
  }, [pathname, currentCategory])

  const isLinkActive = React.useCallback(
    (targetHref: string) => {
      const [targetPath, targetQuery] = targetHref.split('?')
      if (pathname !== targetPath) {
        return false
      }
      if (targetQuery) {
        const targetParams = new URLSearchParams(targetQuery)
        const targetCat = targetParams.get('category')?.toUpperCase()
        if (targetCat) {
          return (currentCategory || 'RUNNING') === targetCat
        }
      } else if (targetPath === '/needle/daily-entry') {
        return !currentCategory || currentCategory === 'RUNNING'
      }
      return true
    },
    [pathname, currentCategory]
  )

  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    needleManagement: true,
    needle: true,
    broken: false,
    idle: false,
    reportStudio: false,
    locationManagement: true,
    admin: true,
  })

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const permissions = user.permissions || []
  const has = (perm?: string) => {
    if (!perm) return true
    if (user.isSiteAdmin) return true
    if (permissions.includes(perm)) return true
    if (
      perm.startsWith('needle_management.') &&
      (permissions.includes('needle.daily_entry.view') || permissions.includes('admin.floors.view'))
    ) {
      return true
    }
    return false
  }

  // Define modules according to Specification §31 & Phase 1.2
  const navItems: { key: string; item: NavItem }[] = [
    {
      key: 'dashboard',
      item: {
        label: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
        permission: 'dashboard.view',
      },
    },
    {
      key: 'needleManagement',
      item: {
        label: 'Needle Management',
        icon: Layers,
        children: [
          {
            label: 'Needle',
            href: '/needle-management/needle',
            permission: 'needle_management.needle.view',
          },
          {
            label: 'Idle Needle',
            href: '/needle-management/idle-needle',
            permission: 'needle_management.ideal_needle.view',
          },
        ],
      },
    },
    {
      key: 'needle',
      item: {
        label: 'Running Needle',
        icon: Package,
        children: [
          { label: 'Daily Entry', href: '/needle/daily-entry?category=RUNNING', permission: 'needle.daily_entry.view' },
          { label: 'Daily Report', href: '/running-needle/daily-report', permission: 'needle.daily_report.view' },
          { label: 'Monthly Report', href: '/running-needle/monthly-report', permission: 'needle.monthly_report.view' },
        ],
      },
    },
    {
      key: 'broken',
      item: {
        label: 'New Needle',
        icon: AlertTriangle,
        children: [
          { label: 'Daily Entry', href: '/needle/daily-entry?category=NEW', permission: 'broken.daily_entry.view' },
          { label: 'Daily Report', href: '/new-needle/daily-report', permission: 'broken.daily_report.view' },
          { label: 'Monthly Report', href: '/new-needle/monthly-report', permission: 'broken.monthly_report.view' },
        ],
      },
    },
    {
      key: 'idle',
      item: {
        label: 'Idle Needle',
        icon: Clock,
        children: [
          { label: 'Daily Entry', href: '/needle/daily-entry?category=IDLE', permission: 'idle.daily_entry.view' },
          { label: 'Daily Report', href: '/idle-needle/daily-report', permission: 'idle.daily_report.view' },
          { label: 'Monthly Report', href: '/idle-needle/monthly-report', permission: 'idle.monthly_report.view' },
        ],
      },
    },
    {
      key: 'reportStudio',
      item: {
        label: 'Report Studio',
        icon: FileBarChart,
        children: [
          { label: 'Regular Reports', href: '/report-studio/regular', permission: 'report_studio.regular.view' },
          { label: 'Custom Reports', href: '/report-studio/custom', permission: 'report_studio.custom.view' },
        ],
      },
    },
    {
      key: 'locationManagement',
      item: {
        label: 'Location Management',
        icon: MapPin,
        children: [
          { label: 'Floors', href: '/location-management/floors', permission: 'admin.floors.view' },
          { label: 'Floor Locations', href: '/location-management/floor-locations', permission: 'admin.floor_locations.view' },
        ],
      },
    },
    {
      key: 'admin',
      item: {
        label: 'Administration',
        icon: Settings,
        children: [
          { label: 'Employees', href: '/administration/employees', permission: 'admin.users.view' },
          { label: 'Roles & Permissions', href: '/administration/roles', permission: 'admin.roles.view' },
          { label: 'Designations', href: '/administration/designations', permission: 'admin.designations.view' },
          { label: 'Audit Log', href: '/administration/audit', permission: 'admin.audit.view' },
        ],
      },
    },
  ]

  // Filter modules: Hide if user lacks module access or if none of its children are accessible (§31)
  const visibleNav = navItems.filter(({ item }) => {
    if (item.href) {
      return has(item.permission)
    }
    if (item.children) {
      return item.children.some((child) => has(child.permission))
    }
    return false
  })

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-60 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border bg-slate-950/40">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-brand to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-brand/20">
            G
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm tracking-wide leading-tight">GMS MCD ERP</span>
            <span className="text-sidebar-text-muted text-[10px] uppercase font-semibold tracking-wider">
              Needle Warehouse
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-sidebar-border">
          {visibleNav.map(({ key, item }) => {
            const Icon = item.icon

            // Single link navigation
            if (item.href) {
              const targetHref = item.href
              const isActive = pathname === targetHref
              return (
                <Link
                  key={key}
                  href={targetHref}
                  onClick={() => {
                    if (pathname !== targetHref) setNavigatingTo(targetHref)
                    onClose()
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-erp text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                  {navigatingTo === targetHref && !isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping ml-auto" />
                  )}
                </Link>
              )
            }

            // Parent with sub-items
            if (item.children) {
              const visibleChildren = item.children.filter((c) => has(c.permission))
              if (visibleChildren.length === 0) return null

              const isChildActive = visibleChildren.some((c) => {
                const [cPath] = c.href.split('?')
                if (cPath === '/needle/daily-entry') {
                  return isLinkActive(c.href)
                }
                return pathname === cPath || pathname.startsWith(cPath + '/')
              })
              const isExpanded = openSections[key] ?? isChildActive

              return (
                <div key={key} className="space-y-1">
                  <button
                    onClick={() => toggleSection(key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-erp text-xs font-semibold transition-colors ${
                      isChildActive
                        ? 'text-white bg-sidebar-hover/80'
                        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-sidebar-text-muted" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-sidebar-text-muted" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="pl-9 pr-1 py-0.5 space-y-1">
                      {visibleChildren.map((child) => {
                        const active = isLinkActive(child.href)
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => {
                              if (pathname !== child.href) setNavigatingTo(child.href)
                              onClose()
                            }}
                            className={`flex items-center justify-between py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
                              active
                                ? 'bg-brand/20 text-blue-400 font-semibold border-l-2 border-brand'
                                : 'text-slate-400 hover:text-white hover:bg-sidebar-hover/50'
                            }`}
                          >
                            <span>{child.label}</span>
                            {navigatingTo === child.href && !active && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return null
          })}
        </nav>

        {/* Footer / User Profile & Logout */}
        <div className="p-3 border-t border-sidebar-border bg-slate-950/30 space-y-1">
          <Link
            href="/profile"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2 rounded-erp text-xs font-semibold transition-colors ${
              pathname === '/profile'
                ? 'bg-brand text-white'
                : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
            }`}
          >
            <User className="w-4 h-4 shrink-0 text-sidebar-text-muted" />
            <div className="flex-1 truncate">
              <p className="truncate text-white text-xs">{user.profile.name}</p>
              <p className="text-[10px] text-sidebar-text-muted">{user.profile.employee_id}</p>
            </div>
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-erp text-xs font-semibold text-danger hover:bg-danger/10 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
