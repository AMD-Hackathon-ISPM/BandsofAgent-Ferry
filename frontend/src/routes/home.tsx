import { useAuth } from "@/providers/auth-provider"
import { RecentRuns } from "@/features/home/components/recent-runs"
import { RepoLauncher } from "@/features/home/components/repo-launcher"

export function Home() {
  const { user } = useAuth()
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Migrations</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Signed in as @{user?.handle}. Start a run, or open one already in flight.
        </p>
      </div>

      <RepoLauncher />

      <div className="mt-8">
        <RecentRuns />
      </div>
    </main>
  )
}

export default Home
