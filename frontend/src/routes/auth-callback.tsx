import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { IconAlertTriangle } from "@tabler/icons-react"

import { useAuth } from "@/providers/auth-provider"
import { WordText } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function AuthCallback() {
  const { user, completeGitHub } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const denied = params.get("error") === "access_denied"

  React.useEffect(() => {
    if (denied) return
    const t = window.setTimeout(() => completeGitHub(), 1600)
    return () => window.clearTimeout(t)
  }, [completeGitHub, denied])

  React.useEffect(() => {
    if (user) navigate("/", { replace: true })
  }, [user, navigate])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <WordText />
      {denied ? (
        <div className="flex max-w-sm flex-col items-center gap-3">
          <IconAlertTriangle className="size-5 text-warning" />
          <p className="text-sm font-medium">GitHub sign-in was cancelled.</p>
          <p className="text-xs text-muted-foreground">Authorize Ferry on GitHub to continue.</p>
          <Button asChild size="sm" variant="outline" className="mt-1">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Spinner />
          Finishing sign-in with GitHub
        </div>
      )}
    </div>
  )
}

export default AuthCallback
