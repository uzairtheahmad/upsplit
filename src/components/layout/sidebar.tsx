'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BrandLockup } from '@/components/layout/brand'
import { useAppActions } from '@/components/layout/app-actions'
import { UserMenu } from '@/components/layout/user-menu'
import { Amount } from '@/components/shared/money'
import { Button } from '@/components/ui/button'
import { groupColor, groupIcon } from '@/constants/categories'
import { PRIMARY_NAV, SECONDARY_NAV } from '@/constants/navigation'
import { useGlobalLedger, useMyGroups } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils/cn'

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  )
}

/** Sidebar contents, shared by the desktop rail and the mobile drawer. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const groups = useMyGroups()
  const ledger = useGlobalLedger()
  const actions = useAppActions()

  const netByGroup = new Map(ledger.perGroup.map((entry) => [entry.group.id, entry.myNet]))

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex h-14 shrink-0 items-center px-4">
        <BrandLockup />
      </div>

      <div className="px-3">
        <Button className="w-full justify-start" onClick={() => actions.addExpense()}>
          <Plus aria-hidden />
          Add expense
        </Button>
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-2">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item.href)}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>

        {groups.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Your groups
              </h2>
              <button
                type="button"
                onClick={actions.createGroup}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Create a group"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <ul className="space-y-0.5">
              {groups.slice(0, 6).map((group) => {
                const Icon = groupIcon(group.icon)
                const active = pathname.startsWith(`/groups/${group.id}`)
                const net = netByGroup.get(group.id) ?? 0

                return (
                  <li key={group.id}>
                    <Link
                      href={`/groups/${group.id}`}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md',
                          groupColor(group.color).chip,
                        )}
                        aria-hidden
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      {net !== 0 ? (
                        <Amount
                          value={net}
                          currency={group.currency}
                          size="xs"
                          tone="auto"
                          absolute
                          className="shrink-0 font-medium"
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <ul className="mt-auto space-y-0.5">
          {SECONDARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item.href)}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <UserMenu />
      </div>
    </div>
  )
}

export function DesktopSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:fixed lg:inset-y-0 lg:left-0 lg:block">
      <SidebarContent />
    </aside>
  )
}
