import type { Metadata } from "next"

import { Atmosphere } from "@/components/marketing/atmosphere"
import { CommunityFeed } from "@/components/marketing/community-feed"
import { loadPublic } from "@/components/marketing/data"

export const metadata: Metadata = {
  title: "Community",
  description:
    "Images and videos published by creators. Open any piece to see the prompt, model and settings, then recreate it.",
}

export default async function CommunityPage() {
  const page = await loadPublic({ limit: 24 })
  return (
    <div className="relative isolate">
      <Atmosphere glow="top" className="-z-10 h-[420px]" />
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 pt-10 md:px-12 md:pt-14">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[36px] leading-none text-lime md:text-[56px]">
            Community
          </h1>
          <p className="max-w-[520px] text-sm text-muted-foreground md:text-base">
            Work creators chose to share. Open a piece to see exactly how it was
            made, then make it your own.
          </p>
        </header>
        <CommunityFeed
          initial={page.items}
          initialCursor={page.nextCursor}
          initialError={page.failed}
        />
      </div>
    </div>
  )
}
