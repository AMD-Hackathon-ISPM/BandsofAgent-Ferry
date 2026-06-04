import * as React from "react"

import type { Role } from "@/lib/domain"
import type { User } from "@/lib/types"
import { CURRENT_USER } from "@/lib/mock/data"

type AuthStatus = "idle" | "authenticating" | "authenticated"

interface AuthState {
  user: User | null
  status: AuthStatus
  beginGitHub: () => void
  completeGitHub: () => void
  signOut: () => void
  setRole: (role: Role) => void
}

const STORAGE_KEY = "ferry.session"

const AuthContext = React.createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(() => {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      return CURRENT_USER
    }
  })
  const [status, setStatus] = React.useState<AuthStatus>(() =>
    user ? "authenticated" : "idle",
  )

  const persist = React.useCallback((next: User | null) => {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else window.localStorage.removeItem(STORAGE_KEY)
  }, [])

  const beginGitHub = React.useCallback(() => setStatus("authenticating"), [])

  const completeGitHub = React.useCallback(() => {
    setUser(CURRENT_USER)
    setStatus("authenticated")
    persist(CURRENT_USER)
  }, [persist])

  const signOut = React.useCallback(() => {
    setUser(null)
    setStatus("idle")
    persist(null)
  }, [persist])

  const setRole = React.useCallback(
    (role: Role) => {
      setUser((prev) => {
        if (!prev) return prev
        const next = { ...prev, role }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const value = React.useMemo<AuthState>(
    () => ({ user, status, beginGitHub, completeGitHub, signOut, setRole }),
    [user, status, beginGitHub, completeGitHub, signOut, setRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
