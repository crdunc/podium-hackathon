import "dotenv/config";
import { addLeadAndContact, processFollowUps } from "./outreach";
import { getAllLeads } from "./db";
import { startScheduler } from "./scheduler";
import { Lead, Industry } from "./types";

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "add": {
      /**
       * Usage:
       *   npx tsx src/index.ts add \
       *     --name "ABC HVAC" \
       *     --industry hvac \
       *     --location "Austin, TX" \
       *     --has-website false \
       *     --email owner@abchvac.com \
       *     --phone +15125550001
       */
      const params = parseFlags(args);
      const lead = await addLeadAndContact({
        businessName: requireFlag(params, "name"),
        industry: requireFlag(params, "industry") as Industry,
        location: requireFlag(params, "location"),
        hasWebsite: requireFlag(params, "has-website") === "true",
        email: requireFlag(params, "email"),
        phone: requireFlag(params, "phone"),
      });
      console.log("\nDone.", lead);
      break;
    }

    case "add-batch": {
      /**
       * Add multiple leads from a JSON file.
       * Usage: npx tsx src/index.ts add-batch leads.json
       *
       * leads.json format:
       * [
       *   {
       *     "businessName": "ABC HVAC",
       *     "industry": "hvac",
       *     "location": "Austin, TX",
       *     "hasWebsite": false,
       *     "email": "owner@abchvac.com",
       *     "phone": "+15125550001"
       *   }
       * ]
       */
      const filePath = args[0];
      if (!filePath) throw new Error("Provide a JSON file path: add-batch <file>");
      const leads: Omit<Lead, "id" | "status" | "sequenceStep" | "nextFollowUpAt" | "createdAt" | "updatedAt">[] =
        JSON.parse(require("fs").readFileSync(filePath, "utf8"));
      for (const lead of leads) {
        await addLeadAndContact(lead);
      }
      break;
    }

    case "follow-ups": {
      /** Manually trigger follow-up processing. */
      await processFollowUps();
      break;
    }

    case "list": {
      /** List all leads. */
      const leads = getAllLeads();
      if (leads.length === 0) {
        console.log("No leads yet.");
      } else {
        console.table(
          leads.map((l) => ({
            id: l.id,
            business: l.businessName,
            location: l.location,
            industry: l.industry,
            hasWebsite: l.hasWebsite,
            status: l.status,
            step: l.sequenceStep,
            nextFollowUp: l.nextFollowUpAt ?? "—",
          }))
        );
      }
      break;
    }

    case "serve": {
      /**
       * Long-running process: starts the scheduler and processes follow-ups hourly.
       * Run this as a persistent service (e.g. with PM2 or a systemd service).
       */
      await processFollowUps(); // Run immediately on start
      startScheduler();
      console.log("Agent running. Press Ctrl+C to stop.");
      // Keep process alive
      process.on("SIGINT", () => {
        console.log("\nShutting down.");
        process.exit(0);
      });
      break;
    }

    default:
      console.log(`
SMB Outreach Agent

Commands:
  add           Add a single lead and send initial outreach
  add-batch     Add leads from a JSON file
  follow-ups    Process all due follow-ups now
  list          List all leads
  serve         Start the scheduler (runs follow-ups hourly)

Example:
  npx tsx src/index.ts add \\
    --name "ABC HVAC" \\
    --industry hvac \\
    --location "Austin, TX" \\
    --has-website false \\
    --email owner@abchvac.com \\
    --phone +15125550001
`);
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      result[key] = args[i + 1] ?? "true";
      i++;
    }
  }
  return result;
}

function requireFlag(flags: Record<string, string>, key: string): string {
  const val = flags[key];
  if (!val) throw new Error(`Missing required flag: --${key}`);
  return val;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
