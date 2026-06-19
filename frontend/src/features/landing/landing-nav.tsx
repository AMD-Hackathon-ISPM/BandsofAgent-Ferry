import { Link } from "react-router-dom"
import { IconBrandGithub, IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react"

import { useAuth } from "@/providers/auth-provider"
import { Logo } from "@/components/brand"
import { useTheme, type Theme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StartMigrationButton } from "./cta"

const APPEARANCE_OPTIONS = [
  { value: "dark", label: "Dark Mode" },
  { value: "light", label: "Light Mode" },
  { value: "system", label: "System Default" },
] satisfies Array<{ value: Theme; label: string }>

const APPEARANCE_ICON: Record<Theme, typeof IconSun> = {
  dark: IconMoon,
  light: IconSun,
  system: IconDeviceDesktop,
}

const GITHUB_REPO_URL = "https://github.com/AMD-Hackathon-ISPM/BandsofAgent-Ferry"

function AppearanceMenu() {
  const { theme, setTheme } = useTheme()
  const SelectedIcon = APPEARANCE_ICON[theme]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          className="size-[35px]"
          aria-label="Select appearance"
        >
          <SelectedIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-44"
      >
        <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          {APPEARANCE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="text-xs"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LandingNav() {
  const { user } = useAuth()

  return (
    <header className="absolute inset-x-0 top-0 z-40 border-b border-transparent bg-transparent">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href="#top"
          className="rounded-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Ferry, back to top"
        >
          <Logo className="h-[19px]" />
        </a>

        <div className="flex items-center gap-3">
          {!user && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
          <AppearanceMenu />
          <Button
            asChild
            variant="outline"
            size="icon-lg"
            className="size-[35px]"
            aria-label="View on GitHub"
          >
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
              <IconBrandGithub />
            </a>
          </Button>
          <StartMigrationButton size="lg" className="px-3.5" />
        </div>
      </div>
    </header>
  )
}
