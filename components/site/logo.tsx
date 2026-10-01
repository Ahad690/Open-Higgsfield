import Link from "next/link"

import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

/** Vireo mark: a lime tile with a wing-shaped V. Placeholder wordmark until brand assets arrive. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill="#D1FE17" />
      <path
        d="M7.5 9.5c2.6 0 4.4 1.3 5.6 3.9L16 19.6l4.3-9.2c.5-1 1.4-1.6 2.5-1.6h1.7L17.6 23.5h-3.2L9.2 12.4c-.4-.9-1-1.4-1.7-1.6V9.5z"
        fill="#131517"
      />
      <circle cx="23.6" cy="8.6" r="1.3" fill="#131517" />
    </svg>
  )
}

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      href="/"
      aria-label={`${BRAND.name} home`}
      className={cn("flex shrink-0 items-center gap-2", className)}
    >
      <LogoMark className={compact ? "size-6" : "size-8"} />
      <span
        className={cn(
          "font-display text-foreground",
          compact ? "text-base" : "text-lg"
        )}
      >
        {BRAND.name}
      </span>
    </Link>
  )
}
