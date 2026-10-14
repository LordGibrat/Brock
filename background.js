const DEFAULTS = {
  enabled: false,
  sites: [],
  alternative: "Take a short walk or return to what you planned to do.",
  comparison: true
};
const ACTIONS = ["pause", "purpose", "alternative"];
const TRIAL_MS = 20 * 60 * 1000;
const HEARTBEAT_MS = 5000;
let cache;
let ready = chrome.storage.local.get("brock").then(async ({ brock }) => {
  cache = brock || { settings: DEFAULTS, trials: [], policy: {}, daily: {}, active: null };
  cache.settings = { ...DEFAULTS, ...cache.settings };
  cache.trials ||= [];
  cache.policy ||= {};
  cache.daily ||= {};
  if (cache.schemaVersion !== 2) {
    cache.policy = {};
    for (const trial of cache.trials) {
      if (trial.status !== "complete") continue;
      trial.success = trial.selectedSeconds <= 120 && !trial.switched;
      if (trial.action === "observe") continue;
      const entry = cache.policy[trial.context] ||= {};
      const arm = entry[trial.action] ||= { count: 0, successes: 0 };
      arm.count += 1;
      arm.successes += Number(trial.success);
    }
    cache.schemaVersion = 2;
    await chrome.storage.local.set({ brock: cache });
  }
});
let writeQueue = Promise.resolve();
const persist = () => {
  const snapshot = structuredClone(cache);
  writeQueue = writeQueue.then(() => chrome.storage.local.set({ brock: snapshot }));
  return writeQueue;
};

function hostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
function normalizeSite(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw || /[\s/?#@]/.test(raw)) return "";
  const site = raw.replace(/^www\./, "");
  if (site === "localhost" || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site)) return site;
  return "";
}
function matchesSite(host, site) {
  return host === site || host.endsWith(`.${site}`);
}
function selected(host) {
  return cache.settings.sites.some((site) => matchesSite(host, site));
}
function timeBand(date) {
  const h = date.getHours();
  return h < 6 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function pickAction(context) {
  if (cache.settings.comparison && Math.random() < 0.2) return "observe";
  const policy = cache.policy[context] || {};
  const untested = ACTIONS.filter((action) => !policy[action]?.count);
  if (untested.length) return untested[Math.floor(Math.random() * untested.length)];
  if (Math.random() < 0.2) return ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  return ACTIONS.reduce((best, action) => {
    const score = (policy[action].successes + 1) / (policy[action].count + 2);
    const bestScore = (policy[best].successes + 1) / (policy[best].count + 2);
    return score > bestScore ? action : best;
  }, ACTIONS[0]);
}
function finalize(now = Date.now()) {
  const trial = cache.active;
  if (!trial || now < trial.endsAt) return false;
  const success = trial.selectedSeconds <= 120 && !trial.switched;
  const completed = { ...trial, success, status: "complete", completedAt: now };
  cache.trials.unshift(completed);
  cache.trials = cache.trials.slice(0, 1000);
  if (trial.action !== "observe") {
    const entry = cache.policy[trial.context] ||= {};
    const arm = entry[trial.action] ||= { count: 0, successes: 0 };
    arm.count += 1;
    arm.successes += Number(success);
  }
  cache.active = null;
  return true;
}

chrome.alarms.create("brock-finalize", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "brock-finalize") return;
  await ready;
  if (finalize()) await persist();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ready;
    if (message.type === "GET_STATE") {
      if (finalize()) await persist();
      return cache;
    }
    if (message.type === "SAVE_SETTINGS") {
      const incoming = message.settings || {};
      const sites = [...new Set((incoming.sites || []).map(normalizeSite).filter(Boolean))].slice(0, 30);
      cache.settings = {
        enabled: Boolean(incoming.enabled),
        comparison: Boolean(incoming.comparison),
        sites,
        alternative: String(incoming.alternative || DEFAULTS.alternative).trim().slice(0, 160)
      };
      if (!cache.settings.enabled || (cache.active && !selected(cache.active.origin))) cache.active = null;
      await persist();
      return { ok: true, settings: cache.settings };
    }
    if (message.type === "CLEAR_DATA") {
      cache.trials = [];
      cache.policy = {};
      cache.daily = {};
      cache.active = null;
      await persist();
      return { ok: true };
    }
    if (message.type === "VISIT") {
      const host = hostname(sender.url);
      const now = Date.now();
      if (!cache.settings.enabled || !selected(host)) return { action: "none" };
      if (finalize(now)) await persist();
      if (cache.active) return { action: "none" };
      const context = `${host}|${timeBand(new Date(now))}`;
      const action = pickAction(context);
      cache.active = {
        id: crypto.randomUUID(),
        origin: host,
        context,
        action,
        startedAt: now,
        endsAt: now + TRIAL_MS,
        selectedSeconds: 0,
        switched: false,
        decision: null,
        status: "active"
      };
      await persist();
      return { action, trialId: cache.active.id, alternative: cache.settings.alternative };
    }
    if (message.type === "HEARTBEAT") {
      const host = hostname(sender.url);
      if (!cache.settings.enabled || !selected(host) || !message.visible) return { ok: true };
      const now = Date.now();
      if (finalize(now)) await persist();
      const key = localDateKey(new Date(now));
      const day = cache.daily[key] ||= { seconds: 0, bySite: {} };
      day.seconds += HEARTBEAT_MS / 1000;
      day.bySite[host] = (day.bySite[host] || 0) + HEARTBEAT_MS / 1000;
      if (cache.active && now < cache.active.endsAt) {
        cache.active.selectedSeconds += HEARTBEAT_MS / 1000;
        if (host !== cache.active.origin) cache.active.switched = true;
      }
      const oldest = Date.now() - 45 * 24 * 60 * 60 * 1000;
      for (const date of Object.keys(cache.daily)) if (new Date(date).getTime() < oldest) delete cache.daily[date];
      await persist();
      return { ok: true };
    }
    if (message.type === "DECISION") {
      if (cache.active?.id === message.trialId) {
        cache.active.decision = ["leave", "continue", "intentional"].includes(message.decision)
          ? message.decision : null;
        if (cache.active.decision === "intentional") {
          cache.active = null;
        }
        await persist();
      }
      return { ok: true };
    }
    return { error: "Unknown message" };
  })().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});
