import { Link, Navigate, Outlet, useLocation } from "react-router-dom"
import { IconChevronDown, IconLogout } from "@tabler/icons-react"

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

function AccountMenu() {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
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
          <DropdownMenuItem onSelect={() => signOut()} variant="destructive">
            <IconLogout data-icon="inline-start" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TopBar({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background px-5 sm:px-8 lg:px-10",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Link to="/" className="rounded-none outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <Logo />
        </Link>
      </div>
      <AccountMenu />
    </header>
  )
}

export function AppLayout() {
  const { user } = useAuth()
  const location = useLocation()
  useDocumentTitle("Ferry · Migrations")
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <TopBar />
      <Outlet />
      <Toaster position="bottom-right" />
    </div>
  )
}
