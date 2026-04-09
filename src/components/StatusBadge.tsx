interface StatusBadgeProps {
  isBuyZone: boolean;
}

export default function StatusBadge({ isBuyZone }: StatusBadgeProps) {
  if (isBuyZone) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        BUY SIGNAL
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-slate-700/60 px-3 py-1 text-xs font-medium text-slate-400 ring-1 ring-inset ring-slate-600">
      Watching
    </span>
  );
}
