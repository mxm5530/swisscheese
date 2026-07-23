// check-volunteers.js
//
// Checks the NYRR volunteer opportunities page for open positions and
// sends a Telegram message when the page's state changes from
// "no opportunities" to "opportunities available".
//
// Designed to run on a schedule (see .github/workflows/check-volunteers.yml)
// State is persisted to state.json so we only alert on NEW openings,
// not every time the script runs.

import fs from "fs";

const URL = "https://www.nyrr.org/getinvolved/volunteer/opportunities";
const STATE_FILE = "./state.json";
const EMPTY_MARKER = "There are no results";

// A normal browser user-agent. Be a good citizen: this script is scheduled
// to run at most every 30 minutes (see the workflow file) so it doesn't
// hammer NYRR's servers.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { hadOpportunities: false, lastCheckedAt: null };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPage() {
  const res = await fetch(URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function sendText(body) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error(
      "Missing Telegram env vars. Need TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
    );
  }

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: body,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Telegram send failed: ${res.status} ${errText}`);
  }
}

async function main() {
  const state = loadState();
  const html = await fetchPage();

  const hasOpportunities = !html.includes(EMPTY_MARKER);

  console.log(
    `Checked at ${new Date().toISOString()} — opportunities currently ${
      hasOpportunities ? "OPEN" : "closed"
    }`
  );

  // Only text when we transition from "nothing open" to "something open".
  // This avoids re-texting on every run while a listing stays open.
  if (hasOpportunities && !state.hadOpportunities) {
    console.log("New volunteer opportunity detected — sending text.");
    await sendText(
      `NYRR volunteer spot just opened up! Check it out: ${URL}`
    );
  }

  saveState({
    hadOpportunities: hasOpportunities,
    lastCheckedAt: new Date().toISOString(),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
