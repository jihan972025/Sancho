interface Props {
  snapshot: string | null
}

export default function SnapshotView({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950 rounded-lg border border-slate-800">
        <p className="text-slate-500 text-sm">No snapshot available</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-950 rounded-lg border border-slate-800 overflow-auto p-4">
      <pre className="text-slate-300 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
        {snapshot}
      </pre>
    </div>
  )
}
