export async function register() {
  // Keep this exact condition around the imports. Next.js removes the block from its Edge build
  // only in this form; an early return would pull server-only packages (OCR, cron) into that build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail at startup with a clear message rather than on the first request.
    const { getEnv } = await import("@/lib/env");
    getEnv();

    const { startScheduler } = await import("@/lib/alerts/scheduler");
    startScheduler();
  }
}
