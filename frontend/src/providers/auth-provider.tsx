import * as React from "react"

import {
  DUMMY_ACCESS_TOKEN,
  DUMMY_REFRESH_TOKEN,
  USE_DUMMY_DATA,
} from "@/lib/dev-mode"
import type { Role } from "@/lib/domain"
import { CURRENT_USER } from "@/lib/mock/data"
import type { User } from "@/lib/types"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080"
const STORAGE_KEY = "ferry.session"

interface StoredSession {
  user: User
  accessToken: string
  refreshToken: string
}

type AuthStatus = "idle" | "authenticating" | "authenticated"

interface AuthState {
  user: User | null
  accessToken: string | null
  status: AuthStatus
  beginGitHub: () => void
  completeGitHub: (session: StoredSession) => void
  signOut: () => void
  setRole: (role: Role) => void
}

const AuthContext = React.createContext<AuthState | undefined>(undefined)

function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

function isValidSession(session: StoredSession | null): session is StoredSession {
  return Boolean(session?.user?.id && session.accessToken)
}

function isDummySession(session: StoredSession | null): boolean {
  return session?.accessToken === DUMMY_ACCESS_TOKEN
}

function createDummySession(): StoredSession {
  return {
    user: CURRENT_USER,
    accessToken: DUMMY_ACCESS_TOKEN,
    refreshToken: DUMMY_REFRESH_TOKEN,
  }
}

function initialSession(): StoredSession | null {
  const stored = loadSession()
  if (isValidSession(stored)) {
    if (!USE_DUMMY_DATA && isDummySession(stored)) return null
    return stored
  }
  if (USE_DUMMY_DATA) return createDummySession()
  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<StoredSession | null>(initialSession)
  const [status, setStatus] = React.useState<AuthStatus>(() =>
    session ? "authenticated" : "idle",
  )

  const persist = React.useCallback((next: StoredSession | null) => {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else window.localStorage.removeItem(STORAGE_KEY)
  }, [])

  const beginGitHub = React.useCallback(() => {
    if (USE_DUMMY_DATA) {
      const next = createDummySession()
      setSession(next)
      setStatus("authenticated")
      persist(next)
      return
    }
    setStatus("authenticating")
    window.location.href = `${API_URL}/auth/github`
  }, [persist])

  const completeGitHub = React.useCallback(
    (newSession: StoredSession) => {
      setSession(newSession)
      setStatus("authenticated")
      persist(newSession)
    },
    [persist],
  )

  const signOut = React.useCallback(() => {
    setSession(null)
    setStatus("idle")
    persist(null)
  }, [persist])

  React.useEffect(() => {
    const onExpired = () => {
      setSession(null)
      setStatus("idle")
      persist(null)
    }
    window.addEventListener("ferry:session-expired", onExpired)
    return () => window.removeEventListener("ferry:session-expired", onExpired)
  }, [persist])

  const setRole = React.useCallback(
    (role: Role) => {
      setSession((prev) => {
        if (!prev) return prev
        const next = { ...prev, user: { ...prev.user, role } }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const value = React.useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      status,
      beginGitHub,
      completeGitHub,
      signOut,
      setRole,
    }),
    [session, status, beginGitHub, completeGitHub, signOut, setRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
