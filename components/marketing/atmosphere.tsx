import { cn } from "@/lib/utils"

const DOTS_MASK =
  "radial-gradient(ellipse 70% 60% at 50% 40%, #000 0%, transparent 75%)"

/**
 * The studio's backdrop: a soft lime radial glow plus a masked dot field
 * (same recipe as ScreenEmptyState). Purely decorative.
 */
export function Atmosphere({
  className,
  glow = "top",
}: {
  className?: string
  glow?: "top" | "bottom" | "center"
}) {
  const at =
    glow === "top" ? "50% 0%" : glow === "bottom" ? "50% 100%" : "50% 50%"
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(60% 55% at ${at}, rgba(209,254,23,0.16) 0%, rgba(209,254,23,0.05) 45%, transparent 75%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: DOTS_MASK,
          WebkitMaskImage: DOTS_MASK,
        }}
      />
    </div>
  )
}
