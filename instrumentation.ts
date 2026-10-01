/**
 * Boot hook: validate the environment (production fails fast with a clear
 * list of missing variables) and, in development, run the reconciler every
 * few seconds — there is no Vercel Cron locally and webhooks need a tunnel.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { env } = await import("./lib/env")
  const value = env()
  if (value.NODE_ENV !== "development" || !value.MONGODB_URI) return
  if (process.env.DEV_RECONCILE === "false") return
  const globalFlag = globalThis as typeof globalThis & {
    __vireoReconciler?: boolean
  }
  if (globalFlag.__vireoReconciler) return
  globalFlag.__vireoReconciler = true
  const { reconcile } = await import("./lib/generations/reconcile")
  const tick = async () => {
    try {
      const summary = await reconcile({ staleSeconds: 4, pendingSeconds: 90 })
      const moved = Object.entries(summary).filter(([, n]) => n > 0)
      if (moved.length)
        console.info("[reconcile:dev]", Object.fromEntries(moved))
    } catch (error) {
      console.error(
        "[reconcile:dev]",
        error instanceof Error ? error.message : error
      )
    }
  }
  setInterval(() => void tick(), 5_000).unref()
}
