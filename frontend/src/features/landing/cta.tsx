import * as React from "react"
import { useNavigate } from "react-router-dom"
import { IconArrowRight } from "@tabler/icons-react"
import { toast } from "sonner"

import { useAuth } from "@/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function StartMigrationButton({
  size = "lg",
  className,
  label = "Start a migration",
  withArrow = true,
  onGuest,
}: {
  size?: React.ComponentProps<typeof Button>["size"]
  className?: string
  label?: string
  withArrow?: boolean
  onGuest?: () => Promise<void>
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [guestLoading, setGuestLoading] = React.useState(false)

  const tryGuest = async () => {
    if (!onGuest || guestLoading) return
    setGuestLoading(true)
    try {
      await onGuest()
    } catch (cause) {
      toast.error("Guest access unavailable", {
        description:
          cause instanceof Error ? cause.message : "Please try again.",
      })
    } finally {
      setGuestLoading(false)
    }
  }

  if (user) {
    return (
      <Button size={size} className={className} onClick={() => navigate("/app")}>
        Open app
        <IconArrowRight data-icon="inline-end" />
      </Button>
    )
  }

  if (onGuest) {
    return (
      <Button
        size={size}
        className={className}
        onClick={() => void tryGuest()}
        disabled={guestLoading}
      >
        {guestLoading ? <Spinner data-icon="inline-start" /> : null}
        {guestLoading ? "Starting guest session" : "Try as guest"}
        {!guestLoading && withArrow ? (
          <IconArrowRight data-icon="inline-end" />
        ) : null}
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
