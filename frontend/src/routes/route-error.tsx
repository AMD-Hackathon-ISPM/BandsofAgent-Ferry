import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconRefresh,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function RouteError() {
  const error = useRouteError()
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong"
  const detail = isRouteErrorResponse(error)
    ? "That request could not be completed."
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred."
  const stack = error instanceof Error ? error.stack : undefined

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <IconAlertTriangle className="size-6 text-warning" />
      <span className="text-2xl font-semibold tracking-tight">{title}</span>
      <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          <IconRefresh data-icon="inline-start" />
          Reload
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/">
            <IconArrowLeft data-icon="inline-start" />
            Back to Ferry
          </Link>
        </Button>
      </div>
      {import.meta.env.DEV && stack && (
        <pre className="mt-4 max-h-64 w-full max-w-2xl overflow-auto rounded-none border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
          {stack}
        </pre>
      )}
    </main>
  )
}

export default RouteError
