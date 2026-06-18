import * as React from "react"
import { useNavigate } from "react-router-dom"
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react"

import { USE_DUMMY_DATA } from "@/lib/dev-mode"
import { useAuth } from "@/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * The page's main call to action. Signing in via GitHub then lands in the app;
 * in dummy/dev mode `beginGitHub` authenticates synchronously, so we push to the
 * app ourselves, while in production it redirects to the GitHub OAuth flow. When
 * a session already exists the button becomes "Open app".
 */
export function StartMigrationButton({
  size = "lg",
  className,
}: {
  size?: React.ComponentProps<typeof Button>["size"]
  className?: string
}) {
  const { user, status, beginGitHub } = useAuth()
  const navigate = useNavigate()
  const authenticating = status === "authenticating"

  const start = React.useCallback(() => {
    beginGitHub()
    if (USE_DUMMY_DATA) navigate("/app")
  }, [beginGitHub, navigate])

  if (user) {
    return (
      <Button size={size} className={className} onClick={() => navigate("/app")}>
        Open app
        <IconArrowRight data-icon="inline-end" />
      </Button>
    )
  }

  return (
    <Button size={size} className={className} onClick={start} disabled={authenticating}>
      {authenticating ? (
        <>
          <Spinner data-icon="inline-start" />
          Opening GitHub
        </>
      ) : (
        <>
          <IconBrandGithub data-icon="inline-start" />
          Start a migration
        </>
      )}
    </Button>
  )
}
