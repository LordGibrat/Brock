const call = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });
const $ = (id) => document.getElementById(id);
let state;
let filter = "all";
let visibleCount = 8;
let saveQueue = Promise.resolve();
const ACTION_NAMES = {
  pause: "10-second pause",
  purpose: "Purpose check",
  alternative: "Alternative suggestion",
  observe: "No prompt"
};

function normalizeSite(raw) {
  const value = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return value === "localhost" || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value) ? value : "";
}
function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
async function refresh() {
  state = await call("GET_STATE");
  if (state.error) throw new Error(state.error);
  const settings = state.settings;
  $("enabled").checked = settings.enabled;
  $("comparison").checked = settings.comparison;
  $("alternative").value = settings.alternative;
  $("power-description").textContent = settings.enabled ? "Watching your chosen sites" : "Paused";
  $("site-count").textContent = `${settings.sites.length} ${settings.sites.length === 1 ? "site" : "sites"}`;
  const list = $("site-list");
  list.replaceChildren();
  settings.sites.forEach((site) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    const label = document.createElement("span");
    label.textContent = site;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${site}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => save((current) => ({ sites: current.sites.filter((entry) => entry !== site) })));
    chip.append(label, remove);
    list.append(chip);
  });
  $("setup-cta").hidden = settings.sites.length > 0;
  renderResults();
  renderInsights();
}
function save(changes) {
  const task = saveQueue.then(async () => {
    const update = typeof changes === "function" ? changes(state.settings) : changes;
    const result = await call("SAVE_SETTINGS", { settings: { ...state.settings, ...update } });
    if (result.error) throw new Error(result.error);
    await refresh();
  });
  saveQueue = task.catch(() => {});
  return task;
}
function switchTab(name) {
  for (const tabName of ["results", "settings"]) {
    const selected = name === tabName;
    $(`${tabName}-tab`).setAttribute("aria-selected", String(selected));
    $(`${tabName}-panel`).hidden = !selected;
  }
}
function formatDuration(seconds) {
  const value = Math.round(seconds || 0);
  return value < 60 ? `${value}s` : `${Math.floor(value / 60)}m ${String(value % 60).padStart(2, "0")}s`;
}
function renderActive() {
  if (!state) return;
  const active = state.active;
  $("active-window").hidden = !active || !state.settings.enabled;
  if (!active || !state.settings.enabled) return;
  $("active-detail").textContent = `${active.origin} · ${ACTION_NAMES[active.action] || active.action} · ${formatDuration(active.selectedSeconds)} tracked`;
  const left = Math.max(0, Math.ceil((active.endsAt - Date.now()) / 1000));
  $("active-timer").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}
function outcomeFor(trial) {
  if (trial.action === "observe") return trial.success
    ? { label: "Low use", className: "badge-observe" }
    : { label: "High use", className: "badge-observe" };
  return trial.success
    ? { label: "Success", className: "badge-success" }
    : { label: "Goal not met", className: "badge-miss" };
}
function reasonFor(trial) {
  if (trial.switched) return `Switched to another watched site; ${formatDuration(trial.selectedSeconds)} tracked across watched sites.`;
  if (trial.selectedSeconds > 120) return `${formatDuration(trial.selectedSeconds)} on watched sites, above the 2-minute goal.`;
  return `${formatDuration(trial.selectedSeconds)} on watched sites, with no switch.`;
}
function renderResults() {
  renderActive();
  const completed = state.trials.filter((trial) => trial.status === "complete").sort((a, b) => b.startedAt - a.startedAt);
  const prompted = completed.filter((trial) => trial.action !== "observe");
  $("success-count").textContent = String(prompted.filter((trial) => trial.success).length);
  $("miss-count").textContent = String(prompted.filter((trial) => !trial.success).length);
  $("comparison-count").textContent = String(completed.length - prompted.length);
  $("history-count").textContent = `${completed.length} ${completed.length === 1 ? "window" : "windows"}`;
  let shown = completed;
  if (filter === "success") shown = prompted.filter((trial) => trial.success);
  if (filter === "miss") shown = prompted.filter((trial) => !trial.success);
  if (filter === "observe") shown = completed.filter((trial) => trial.action === "observe");
  const list = $("history-list");
  list.replaceChildren();
  if (!shown.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = completed.length ? "No windows match this filter yet." : "No completed windows yet. Brock will show each result here after 20 minutes.";
    list.append(empty);
  }
  for (const trial of shown.slice(0, visibleCount)) {
    const item = document.createElement("article");
    item.className = "history-item";
    const head = document.createElement("div");
    head.className = "history-head";
    const site = document.createElement("span");
    site.className = "history-name";
    site.textContent = trial.origin;
    const badge = document.createElement("span");
    const outcome = outcomeFor(trial);
    badge.className = `badge ${outcome.className}`;
    badge.textContent = outcome.label;
    head.append(site, badge);
    const meta = document.createElement("div");
    meta.className = "history-meta";
    const date = new Date(trial.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    meta.textContent = `${date} · ${ACTION_NAMES[trial.action] || trial.action}`;
    const reason = document.createElement("p");
    reason.className = "history-reason";
    reason.textContent = reasonFor(trial);
    item.append(head, meta, reason);
    list.append(item);
  }
  $("more-results").hidden = shown.length <= visibleCount;
  $("more-results").textContent = `Show more (${shown.length - visibleCount} left)`;
}
function renderInsights() {
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const seconds = dates.map((date) => state.daily[dateKey(date)]?.seconds || 0);
  const total = seconds.reduce((a, b) => a + b, 0);
  const cutoff = dates[0].getTime();
  const completed = state.trials.filter((trial) => trial.startedAt >= cutoff && trial.status === "complete");
  const chart = $("chart");
  chart.replaceChildren();
  const max = Math.max(...seconds, 1);
  dates.forEach((date, index) => {
    const wrap = document.createElement("div");
    wrap.className = "bar-wrap";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(3, (seconds[index] / max) * 51)}px`;
    bar.title = `${Math.round(seconds[index] / 60)} minutes`;
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);
    wrap.append(bar, label);
    chart.append(wrap);
  });
  $("insight").textContent = completed.length
    ? `${Math.round(total / 60)} minutes on watched sites this week. Window outcomes above are observations, not proof of effectiveness.`
    : "Your first result will appear after a 20-minute window.";
}

$("results-tab").addEventListener("click", () => switchTab("results"));
$("settings-tab").addEventListener("click", () => switchTab("settings"));
$("go-settings").addEventListener("click", () => switchTab("settings"));
for (const button of document.querySelectorAll(".filters button")) {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    visibleCount = 8;
    for (const option of document.querySelectorAll(".filters button")) option.setAttribute("aria-pressed", String(option === button));
    renderResults();
  });
}
$("more-results").addEventListener("click", () => { visibleCount += 8; renderResults(); });

$("site-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const site = normalizeSite($("site-input").value);
  if (!site) { $("site-error").textContent = "Enter a domain such as youtube.com."; return; }
  if (state.settings.sites.includes(site)) { $("site-error").textContent = "That site is already on your list."; return; }
  if (state.settings.sites.length >= 30) { $("site-error").textContent = "The limit is 30 sites."; return; }
  $("site-error").textContent = "";
  $("site-form").querySelector("button").disabled = true;
  try {
    await save((current) => ({ sites: [...new Set([...current.sites, site])] }));
    $("site-input").value = "";
  } finally {
    $("site-form").querySelector("button").disabled = false;
  }
});
$("enabled").addEventListener("change", (event) => save({ enabled: event.target.checked }));
$("comparison").addEventListener("change", (event) => save({ comparison: event.target.checked }));
$("alternative").addEventListener("change", (event) => save({ alternative: event.target.value }));
$("export").addEventListener("click", async () => {
  const data = await call("GET_STATE");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `brock-data-${dateKey(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("clear").addEventListener("click", async () => {
  if (!confirm("Delete Brock's activity history and learning data? Your settings will stay.")) return;
  await call("CLEAR_DATA");
  await refresh();
});

refresh().catch((error) => { $("insight").textContent = `Could not load Brock: ${error.message}`; });
setInterval(renderActive, 1000);
setInterval(async () => {
  if ($("results-panel").hidden) return;
  const latest = await call("GET_STATE");
  if (latest.error) return;
  state = latest;
  renderResults();
  renderInsights();
}, 15000);
