export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`h-9 w-9 shrink-0 ${className}`} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#6D5EFC" />
      <path
        d="M20 22h13l5 6h6a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3V25a3 3 0 0 1 3-3Z"
        stroke="white"
        strokeWidth="3.2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M26 38h12m-5-5 5 5-5 5" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
