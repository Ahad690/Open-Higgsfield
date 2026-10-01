import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"

/** Lime uppercase section title, grey one-liner and an optional right action (§3 pattern). */
export function SectionHeader({
  id,
  title,
  description,
  action,
  className,
}: {
  id?: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 md:mb-5",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2
          id={id}
          className="font-display text-2xl leading-8 text-lime md:text-[28px] md:leading-9"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** The blurred, centred "View all … ↗" pill that sits on a section's bottom fade. */
export function ViewAllPill({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-lime/10 bg-[#1f2603]/80 px-4 text-sm font-medium text-lime backdrop-blur-md transition-colors hover:bg-[#344006]/90"
    >
      {children} <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  )
}

/**
 * Clips a media wall to a fixed height and fades it into the page, with the
 * "View all" pill centred on the fade.
 */
export function FadeClamp({
  children,
  href,
  label,
  className,
}: {
  children: ReactNode
  href: string
  label: string
  className?: string
}) {
  return (
    <div className="relative">
      {/* 4px of slack so keyboard focus rings on edge tiles aren't clipped. */}
      <div className={cn("-m-1 overflow-hidden p-1", className)}>
        {children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent via-page/70 to-page"
      />
      <div className="absolute inset-x-0 bottom-8 flex justify-center">
        <ViewAllPill href={href}>{label}</ViewAllPill>
      </div>
    </div>
  )
}
