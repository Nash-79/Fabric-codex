export function FabricMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="fm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="50%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path
        fill="url(#fm-g)"
        d="M6 10c3-6 13-6 16 0 1 2 2 4 4 5-2 2-5 2-7 4-2 2-3 5-6 5-3 0-5-3-7-5-2-2-5-2-6-4 1-2 4-3 6-5z"
      />
    </svg>
  );
}
