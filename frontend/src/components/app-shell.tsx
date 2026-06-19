import * as React from "react"
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom"
import { IconChevronDown, IconLogin, IconLogout } from "@tabler/icons-react"

import { useDocumentTitle } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/auth-provider"
import { Logo } from "@/components/brand"
import { useTheme, type Theme } from "@/components/theme-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toaster } from "@/components/ui/sonner"

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const APPEARANCE_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "dark", label: "Dark Mode" },
  { value: "light", label: "Light Mode" },
  { value: "system", label: "System Default" },
]

type AppChrome = {
  content?: React.ReactNode
  actions?: React.ReactNode
  logoLabel?: string
  logoTo?: string
}

const AppChromeContext = React.createContext<{
  setChrome: (chrome: AppChrome | null) => void
} | null>(null)

export function useAppChrome() {
  const value = React.useContext(AppChromeContext)
  if (!value) throw new Error("useAppChrome must be used within AppLayout")
  return value
}

function AccountMenu() {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 pr-1.5 pl-1">
          <Avatar className="size-6">
            {user.avatarUrl && (
              <AvatarImage src={user.avatarUrl} alt={`${user.name} avatar`} />
            )}
            <AvatarFallback className="bg-secondary text-[10px] font-semibold">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-muted-foreground sm:inline">@{user.handle}</span>
          <IconChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {APPEARANCE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {user.isGuest ? (
            <DropdownMenuItem
              onSelect={() => {
                signOut()
                navigate("/login")
              }}
            >
              <IconLogin data-icon="inline-start" />
              Sign in
            </DropdownMenuItem>
          ) : (
          <DropdownMenuItem onSelect={() => signOut()} variant="destructive">
            <IconLogout data-icon="inline-start" />
            Sign out
          </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TopBar({
  className,
  chrome,
}: {
  className?: string
  chrome?: AppChrome | null
}) {
  const logoTo = chrome?.logoTo ?? "/app"
  const logoLabel = chrome?.logoLabel ?? "Ferry home"
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-5 sm:px-8 lg:px-10",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={logoTo}
          aria-label={logoLabel}
          className="shrink-0 rounded-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Logo />
        </Link>
        {chrome?.content && (
          <>
            <span className="shrink-0 font-mono text-sm text-muted-foreground/45">
              /
            </span>
            <div className="min-w-0">{chrome.content}</div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {chrome?.actions}
        <AccountMenu />
      </div>
    </header>
  )
}

export function AppLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [chrome, setChrome] = React.useState<AppChrome | null>(null)
  useDocumentTitle("Ferry · Migrations")
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return (
    <AppChromeContext.Provider value={{ setChrome }}>
      <div className="flex min-h-svh flex-col bg-background">
        <TopBar chrome={chrome} />
        <Outlet />
        <Toaster position="bottom-right" />
      </div>
    </AppChromeContext.Provider>
  )
}
