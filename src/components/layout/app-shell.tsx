'use client'

import { Menu, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'

import { useAppActions } from '@/components/layout/app-actions'
import { BrandLockup } from '@/components/layout/brand'
import { DemoBanner } from '@/components/layout/demo-banner'
import { DesktopSidebar, SidebarContent } from '@/components/layout/sidebar'
import { UserMenu } from '@/components/layout/user-menu'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { PageLoader } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { MOBILE_NAV } from '@/constants/navigation'
import { useWorkspaceLoader } from '@/hooks/use-session'
import { useAppStore } from '@/lib/store/app-store'
import { cn } from '@/lib/utils/cn'

function MobileNav() {
  const pathname = usePathname()
  const actions = useAppActions()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-center">
        {MOBILE_NAV.slice(0, 2).map((item) => (
          <MobileNavItem key={item.href} item={item} pathname={pathname} />
        ))}

        <li className="flex justify-center">
          <Button
            size="icon"
            className="size-11 rounded-full shadow-lg"
            onClick={() => actions.addExpense()}
            aria-label="Add expense"
          >
            <Plus className="size-5" aria-hidden />
          </Button>
        </li>

        {MOBILE_NAV.slice(2).map((item) => (
          <MobileNavItem key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  )
}

function MobileNavItem({
  item,
  pathname,
}: {
  item: (typeof MOBILE_NAV)[number]
  pathname: string
}) {
  const active =
    item.href === '/dashboard'
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  const Icon = item.icon

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden />
        {item.short ?? item.label}
      </Link>
    </li>
  )
}

function AppHeader() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const actions = useAppActions()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Links to every section of UpSplit and your groups.
          </SheetDescription>
          <SidebarContent onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:hidden">
        <BrandLockup />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Search expenses"
          className="hidden sm:inline-flex"
        >
          <Link href="/expenses">
            <Search aria-hidden />
          </Link>
        </Button>

        <ThemeToggle />

        <NotificationBell />

        <Button size="sm" className="hidden lg:inline-flex" onClick={() => actions.addExpense()}>
          <Plus aria-hidden />
          Add expense
        </Button>

        <span className="lg:hidden">
          <UserMenu compact />
        </span>
      </div>
    </header>
  )
}

/**
 * The authenticated shell.
 *
 * Route protection lives in middleware, so anyone reaching this component
 * already has a valid session. What happens here is the data load: the client
 * cache is empty until the workspace comes back from Supabase.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useAppStore((state) => state.hydrated)
  const loadError = useAppStore((state) => state.loadError)
  const signingOut = useAppStore((state) => state.signingOut)
  const pathname = usePathname()

  useWorkspaceLoader()

  // Checked before anything else, including loadError: once sign-out has been
  // asked for, the browser is on its way to /login and nothing about the
  // signed-in session should still be on screen while it gets there.
  if (signingOut) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy>
        <span className="sr-only" role="status">
          Signing out
        </span>
        <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy>
        <span className="sr-only">Loading UpSplit</span>
        <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-lg font-semibold text-foreground">Could not load your data</h1>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <DesktopSidebar />
      <div className="lg:pl-64">
        <AppHeader />
        <main id="main" className="pb-24 lg:pb-0">
          {/*
            * Keyed by pathname so each route gets its own boundary. Without the
            * key React reuses the previous one, which means it keeps the old
            * page on screen while the next route's payload is still in flight —
            * the navigation appears to hang, then jumps. A fresh boundary shows
            * the spinner instead. When a route is already prefetched nothing
            * suspends, so there is no flash.
            */}
          <React.Suspense key={pathname} fallback={<PageLoader />}>
            {children}
          </React.Suspense>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
