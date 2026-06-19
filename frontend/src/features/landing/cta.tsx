import * as React from "react"
import { useNavigate } from "react-router-dom"
import { IconArrowRight } from "@tabler/icons-react"

import { useAuth } from "@/providers/auth-provider"
import { Button } from "@/components/ui/button"

/**
 * The page's main call to action. For signed-out visitors this routes to the
 * `/login` page, which owns the GitHub OAuth flow; the landing page itself never
 * authenticates. When a session already exists the button becomes "Open app".
 */
export function StartMigrationButton({
  size = "lg",
  className,
  label = "Start a migration",
  withArrow = true,
}: {
  size?: React.ComponentProps<typeof Button>["size"]
  className?: string
  label?: string
  withArrow?: boolean
}) {
  const { user } = useAuth()
  const navigate = useNavigate()

  if (user) {
    return (
      <Button size={size} className={className} onClick={() => navigate("/app")}>
        Open app
        <IconArrowRight data-icon="inline-end" />
      </Button>
    )
  }

  return (
    <Button size={size} className={className} onClick={() => navigate("/login")}>
      {label}
      {withArrow && <IconArrowRight data-icon="inline-end" />}
    </Button>
  )
}
