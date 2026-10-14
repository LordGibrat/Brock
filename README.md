# Brock — version 2

Project owner: [LordGibrat](https://github.com/LordGibrat). Built with Codex assistance.

Brock is a local-only Chrome/Chromium extension prototype for studying unwanted browsing loops. It gives you a pause, asks for your purpose, or suggests an alternative when you open a site you chose to watch. It then observes the next 20 minutes across **all** watched sites, so switching from one distracting site to another is visible in the result.

The **Results** tab shows the active window, success and goal-not-met totals, a filterable history of individual windows, and a seven-day activity chart. The **Settings** tab holds your site list and controls.

## Install

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this `Brock` folder.
4. Pin Brock, add at least one domain (for example `youtube.com`), and turn on Protection.
5. Reload any watched tabs that were already open.

The extension requests access to HTTP and HTTPS pages so it can display a prompt on user-selected sites. It does **not** read page contents, keystrokes, messages, or passwords. Its settings and usage summaries remain in browser-local extension storage. The only observed unit is a five-second focused interval on a selected domain.

## How the prototype learns

- The three prompts are a 10-second pause, a purpose question, and a replacement suggestion.
- On a first visit within each domain and time-of-day context, Brock tries each prompt. Later it usually selects the one with the highest smoothed success rate, with some exploration.
- If comparison visits are enabled, roughly 20% of 20-minute windows have no prompt.
- A prompted window counts as a success if total focused time across all selected sites stays at or below two minutes **and** the user does not move to another watched site. Otherwise it is shown as **Goal not met**, with the reason.
- No-prompt comparison windows are shown separately as **Low use** or **High use**. They are not counted as prompt successes or failures.
- Clicking **I need this site for a task** excludes that window from learning.
- The most recent 1,000 completed windows are retained locally. The Results tab lets you page through them; **Export my data** downloads the saved data as JSON.

Version 2 recalculates results saved by version 1 using the corrected site-switch rule. Existing settings and history remain available.

This is an exploratory personal prototype, not a clinical treatment or a validated measure of addiction. The summary compares observed windows descriptively; a controlled study with consent and a larger sample would be needed to estimate effects. Activity in other browsers, private windows, other devices, or sites outside the selected list is not visible to Brock.

## Research extension

A study could compare fixed pauses, random prompt choice, and Brock's adaptive policy using a preregistered within-person design. Important outcomes would include selected-site time, site switching, user-reported agency, prompt burden, and effects after prompts are removed.

## Development and verification

No build step is required: load this folder directly as an unpacked extension. For the browser integration test, run `npm ci`, install Playwright's Chromium browser with `npx playwright install chromium`, then run `npm run test:e2e`. The test launches a visible browser and uses two local test sites. If you want to run it against installed Microsoft Edge, set `BROCK_BROWSER=msedge` in your shell before the test.
