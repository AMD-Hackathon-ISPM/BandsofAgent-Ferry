import { Link } from "react-router-dom"
import { IconArrowLeft } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="tabular text-3xl font-semibold tracking-tight">404</span>
      <p className="max-w-sm text-sm text-muted-foreground">
        That page is not part of the control room. Head back to your runs.
      </p>
      <Button asChild size="sm" variant="outline">
        <Link to="/">
          <IconArrowLeft data-icon="inline-start" />
          Back to Ferry
        </Link>
      </Button>
    </main>
  )
}

export default NotFound
