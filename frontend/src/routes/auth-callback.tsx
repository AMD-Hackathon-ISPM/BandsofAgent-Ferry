import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertTriangle } from "@tabler/icons-react"

import type { Role } from "@/lib/domain"
import type { User } from "@/lib/types"
import { useDocumentTitle } from "@/lib/hooks"
import { useAuth } from "@/providers/auth-provider"
import { Logo } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function AuthCallback() {
  const { completeGitHub } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = React.useState<string | null>(null)
  useDocumentTitle("Ferry · Sign In")

  React.useEffect(() => {
    const errorParam = params.get("error")
    if (errorParam) {
      setError(errorParam)
      return
    }

    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    const userId = params.get("user_id")
    const userName = params.get("user_name")
    const userEmail = params.get("user_email")
    const userHandle = params.get("user_handle")
    const userAvatar = params.get("user_avatar")
    const role = (params.get("role") as Role) ?? "engineer"

    if (!accessToken || !userId) {
      setError("missing_params")
      return
    }

    const user: User = {
      id: userId,
      name: userName ?? userHandle ?? "GitHub User",
      handle: userHandle ?? "",
      email: userEmail ?? "",
      role,
      avatarUrl: userAvatar ?? undefined,
    }

    completeGitHub({ user, accessToken, refreshToken: refreshToken ?? "" })
    navigate("/", { replace: true })
  }, [params, completeGitHub, navigate])

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <Logo />
        <div className="flex max-w-sm flex-col items-center gap-3">
          <IconAlertTriangle className="size-5 text-warning" />
          <p className="text-sm font-medium">
            {error === "access_denied"
              ? "GitHub sign-in was cancelled."
              : "Sign-in failed. Please try again."}
          </p>
          <p className="text-xs text-muted-foreground">
            {error === "access_denied"
              ? "Authorize Ferry on GitHub to continue."
              : `Error: ${error}`}
          </p>
          <Button asChild size="sm" variant="outline" className="mt-1">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Spinner />
        Finishing sign-in with GitHub
      </div>
    </div>
  )
}

export default AuthCallback
