/**
 * auto-retweet.js
 *
 * Automatically retweets daily tweets from the 5 most followed Twitter profiles.
 *
 * Required environment variables (set in .env):
 *   TWITTER_APP_KEY          - OAuth 1.0a App Key (Consumer Key)
 *   TWITTER_APP_SECRET       - OAuth 1.0a App Secret (Consumer Secret)
 *   TWITTER_ACCESS_TOKEN     - OAuth 1.0a Access Token (your account)
 *   TWITTER_ACCESS_SECRET    - OAuth 1.0a Access Token Secret (your account)
 *
 * Optional environment variables:
 *   TOP_PROFILES             - Comma-separated Twitter usernames to follow
 *                              Defaults to the 5 most followed accounts (as of 2025)
 *   CHECK_INTERVAL_MINUTES   - How often to poll for new tweets (default: 30)
 *   RUN_HOUR                 - Hour of day (0-23) to run the daily job (default: 8)
 *
 * Usage:
 *   npm install
 *   cp .env.example .env   # fill in your credentials
 *   npm start
 */

require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOP_PROFILES = (
  process.env.TOP_PROFILES ||
  "elonmusk,barackobama,justinbieber,katyperry,rihanna"
)
  .split(",")
  .map((u) => u.trim().replace(/^@/, ""));

const CHECK_INTERVAL_MINUTES = parseInt(
  process.env.CHECK_INTERVAL_MINUTES || "30",
  10
);
const RUN_HOUR = parseInt(process.env.RUN_HOUR || "8", 10);

// File used to persist already-retweeted tweet IDs across restarts
const STATE_FILE = path.join(__dirname, ".retweeted-ids.json");

// ---------------------------------------------------------------------------
// Twitter client (OAuth 1.0a — required for write actions like retweet)
// ---------------------------------------------------------------------------

function buildClient() {
  const required = [
    "TWITTER_APP_KEY",
    "TWITTER_APP_SECRET",
    "TWITTER_ACCESS_TOKEN",
    "TWITTER_ACCESS_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Copy .env.example to .env and fill in your credentials.");
    process.exit(1);
  }

  return new TwitterApi({
    appKey: process.env.TWITTER_APP_KEY,
    appSecret: process.env.TWITTER_APP_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
}

// ---------------------------------------------------------------------------
// State helpers — track which tweet IDs have already been retweeted
// ---------------------------------------------------------------------------

function loadRetweetedIds() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
    }
  } catch {
    // ignore corrupt state
  }
  return new Set();
}

function saveRetweetedIds(ids) {
  fs.writeFileSync(STATE_FILE, JSON.stringify([...ids]), "utf8");
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Resolve Twitter usernames to their numeric user IDs.
 * Returns a map of { username -> userId }.
 */
async function resolveUserIds(client, usernames) {
  const response = await client.v2.usersByUsernames(usernames, {
    "user.fields": ["id", "name", "username", "public_metrics"],
  });

  if (!response.data || response.data.length === 0) {
    throw new Error("Could not resolve any usernames.");
  }

  const map = {};
  for (const user of response.data) {
    map[user.username.toLowerCase()] = user;
    const followers = user.public_metrics?.followers_count?.toLocaleString() ?? "?";
    console.log(
      `  @${user.username} (${user.name}) — ${followers} followers [id: ${user.id}]`
    );
  }
  return map;
}

/**
 * Fetch tweets posted in the last `windowHours` hours by a given user.
 */
async function fetchRecentTweets(client, userId, windowHours = 24) {
  const startTime = new Date(
    Date.now() - windowHours * 60 * 60 * 1000
  ).toISOString();

  const response = await client.v2.userTimeline(userId, {
    max_results: 20,
    start_time: startTime,
    "tweet.fields": ["created_at", "author_id", "text"],
    exclude: ["retweets", "replies"], // only original tweets
  });

  return response.data?.data ?? [];
}

/**
 * Retweet a single tweet by its ID using the authenticated user's account.
 */
async function retweetTweet(client, myUserId, tweetId) {
  await client.v2.retweet(myUserId, tweetId);
}

/**
 * Main job: find new tweets from the top profiles and retweet them.
 */
async function runRetweetJob(client, userMap, retweetedIds) {
  const me = await client.v2.me();
  const myUserId = me.data.id;
  console.log(`\nRunning retweet job as @${me.data.username} (${new Date().toISOString()})`);

  let newRetweetCount = 0;

  for (const username of TOP_PROFILES) {
    const user = userMap[username.toLowerCase()];
    if (!user) {
      console.warn(`  [skip] @${username} — could not resolve user`);
      continue;
    }

    let tweets;
    try {
      tweets = await fetchRecentTweets(client, user.id);
    } catch (err) {
      console.error(`  [error] Fetching tweets for @${username}: ${err.message}`);
      continue;
    }

    if (tweets.length === 0) {
      console.log(`  @${username} — no new tweets in the last 24 h`);
      continue;
    }

    for (const tweet of tweets) {
      if (retweetedIds.has(tweet.id)) {
        continue; // already retweeted
      }

      try {
        await retweetTweet(client, myUserId, tweet.id);
        retweetedIds.add(tweet.id);
        newRetweetCount++;
        console.log(
          `  [RT] @${username}: "${tweet.text.slice(0, 80).replace(/\n/g, " ")}..."`
        );
      } catch (err) {
        // 403 with code 327 means "already retweeted" — mark as done
        if (err?.data?.detail?.includes("already retweeted") ||
            err?.code === 327) {
          retweetedIds.add(tweet.id);
        } else {
          console.error(
            `  [error] Retweeting tweet ${tweet.id} from @${username}: ${err.message}`
          );
        }
      }

      // Respect Twitter's rate limits — short pause between retweets
      await sleep(1500);
    }
  }

  saveRetweetedIds(retweetedIds);
  console.log(
    `Job complete — ${newRetweetCount} new retweet(s). Total tracked: ${retweetedIds.size}.`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const client = buildClient();

  console.log("=== Auto-Retweet Bot ===");
  console.log(`Tracking profiles: ${TOP_PROFILES.map((u) => "@" + u).join(", ")}`);
  console.log(`Check interval   : every ${CHECK_INTERVAL_MINUTES} minute(s)`);
  console.log(`Daily job hour   : ${RUN_HOUR}:00 (local time)\n`);

  // Resolve user IDs once at startup
  console.log("Resolving user IDs...");
  let userMap;
  try {
    userMap = await resolveUserIds(client, TOP_PROFILES);
  } catch (err) {
    console.error(`Failed to resolve user IDs: ${err.message}`);
    process.exit(1);
  }

  const retweetedIds = loadRetweetedIds();
  console.log(`Loaded ${retweetedIds.size} previously retweeted IDs from state.\n`);

  // Run once immediately on start
  await runRetweetJob(client, userMap, retweetedIds);

  // Schedule: run at the configured hour every day
  const dailyCron = `0 ${RUN_HOUR} * * *`;
  cron.schedule(dailyCron, async () => {
    console.log(`\n[cron] Daily job triggered at ${RUN_HOUR}:00`);
    await runRetweetJob(client, userMap, retweetedIds);
  });

  // Also poll every CHECK_INTERVAL_MINUTES to catch tweets throughout the day
  if (CHECK_INTERVAL_MINUTES > 0) {
    const intervalCron = `*/${CHECK_INTERVAL_MINUTES} * * * *`;
    cron.schedule(intervalCron, async () => {
      await runRetweetJob(client, userMap, retweetedIds);
    });
    console.log(`\nPolling every ${CHECK_INTERVAL_MINUTES} min. Press Ctrl+C to stop.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
