import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { Atmosphere } from "./atmosphere"

/** Friendly empty / error card used by the community wall and feeds. */
export function EmptyCard({
  icon,
  title,
  body,
  action,
  className,
  headingLevel = 2,
}: {
  icon: ReactNode
  title: string
  body: ReactNode
  action?: ReactNode
  className?: string
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  return (
    <div
      className={cn(
        "relative isolate mx-auto flex max-w-[560px] flex-col items-center gap-4 overflow-hidden rounded-3xl border border-hairline bg-panel px-6 py-12 text-center",
        className
      )}
    >
      <Atmosphere glow="top" className="-z-10" />
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white/5 text-foreground ring-1 ring-white/10">
        {icon}
      </span>
      <div className="flex flex-col gap-1.5">
        <Heading className="text-xl font-semibold">{title}</Heading>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  )
}
