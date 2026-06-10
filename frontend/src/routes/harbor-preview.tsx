import { HarborView } from "@/features/harbor/harbor-view"
import { RUNS } from "@/lib/mock/data"

export default function HarborPreview() {
  const run = RUNS.run_7
  return (
    <div className="dark flex h-screen w-screen bg-background">
      <HarborView
        run={run}
        messages={run.messages}
        streamedIds={new Set()}
        className="min-h-0 flex-1"
      />
    </div>
  )
}
