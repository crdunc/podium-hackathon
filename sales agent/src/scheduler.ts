import cron from "node-cron";
import { processFollowUps } from "./outreach";

/**
 * Starts a cron job that checks for due follow-ups every hour.
 * Can be adjusted to run more/less frequently.
 */
export function startScheduler(): void {
  // Runs at the top of every hour
  const job = cron.schedule("0 * * * *", async () => {
    console.log(`\n[${new Date().toISOString()}] Running scheduled follow-up check...`);
    try {
      await processFollowUps();
    } catch (err) {
      console.error("Follow-up processor error:", err);
    }
  });

  job.start();
  console.log("Scheduler started — checking for follow-ups every hour.");
}
