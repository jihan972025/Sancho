interface Props {
  screenshot: string | null
}

export default function ScreenshotView({ screenshot }: Props) {
  if (!screenshot) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950 rounded-lg border border-slate-800">
        <p className="text-slate-500 text-sm">No screenshot available</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
      <img
        src={`data:image/png;base64,${screenshot}`}
        alt="Browser screenshot"
        className="w-full h-full object-contain"
      />
    </div>
  )
}
