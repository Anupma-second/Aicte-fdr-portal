import cron from "node-cron";
import { runAlertJob } from "./job";

const DAILY_AT_6AM = "0 6 * * *";
const globalForScheduler = globalThis as unknown as { alertSchedulerStarted?: boolean };

/** Dev server reloads run this again, so the flag stops a second schedule being added. */
export function startScheduler() {
  if (globalForScheduler.alertSchedulerStarted) return;
  globalForScheduler.alertSchedulerStarted = true;
  cron.schedule(
    DAILY_AT_6AM,
    () => {
      runAlertJob()
        .then((summary) => console.log("Daily alert job finished", summary))
        .catch((error) => console.error("Daily alert job failed", error));
    },
    { timezone: "Asia/Kolkata" },
  );
}
