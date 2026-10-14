(() => {
  if (window !== window.top || window.__brockLoaded) return;
  window.__brockLoaded = true;
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => null);
  let overlayActive = false;
  let timer;

  function showPrompt(result) {
    if (!result || result.action === "none" || result.action === "observe") return;
    overlayActive = true;
    const host = document.createElement("div");
    host.id = "brock-root";
    document.documentElement.append(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 20px; background: rgba(17, 25, 39, .72); backdrop-filter: blur(7px); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      .card { width: min(420px, 100%); box-sizing: border-box; padding: 32px; border-radius: 24px; background: #f9f8f4; color: #172336; box-shadow: 0 28px 80px rgba(0,0,0,.26); }
      .brand { color: #496c65; font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 20px 0 10px; font-size: 29px; letter-spacing: -.04em; line-height: 1.1; }
      p { color: #5d6873; line-height: 1.5; font-size: 15px; }
      input { box-sizing: border-box; width: 100%; margin: 10px 0 18px; padding: 13px 14px; border: 1px solid #cdd6d2; border-radius: 12px; background: white; color: #172336; font: inherit; }
      button { cursor: pointer; width: 100%; border-radius: 12px; padding: 13px; font: 700 14px ui-sans-serif, system-ui, sans-serif; }
      .primary { border: 0; background: #246f5d; color: white; }
      .secondary { margin-top: 9px; border: 1px solid #cdd6d2; background: transparent; color: #172336; }
      .quiet { margin-top: 13px; border: 0; background: transparent; color: #64747a; font-weight: 500; }
      .note { margin-top: 17px; color: #748079; font-size: 12px; text-align: center; }
    `;
    root.append(style);
    const card = document.createElement("div");
    card.className = "backdrop";
    const box = document.createElement("div");
    box.className = "card";
    const brand = document.createElement("div");
    brand.className = "brand";
    brand.textContent = "Brock · a moment to choose";
    const title = document.createElement("h1");
    const copy = document.createElement("p");
    const input = document.createElement("input");
    input.placeholder = "A few words are enough";
    input.maxLength = 100;
    const leave = document.createElement("button");
    leave.className = "primary";
    leave.textContent = "Leave this site";
    const keep = document.createElement("button");
    keep.className = "secondary";
    keep.textContent = "Continue";
    const intentional = document.createElement("button");
    intentional.className = "quiet";
    intentional.textContent = "I need this site for a task";
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "Your browsing data stays on this device.";
    if (result.action === "pause") {
      title.textContent = "Give yourself ten seconds.";
      copy.textContent = "Notice what you were about to do. You can still choose to continue.";
      keep.disabled = true;
      let remaining = 10;
      keep.textContent = `Continue in ${remaining}s`;
      timer = setInterval(() => {
        remaining--;
        keep.textContent = remaining ? `Continue in ${remaining}s` : "Continue";
        if (!remaining) { keep.disabled = false; clearInterval(timer); }
      }, 1000);
    } else if (result.action === "purpose") {
      title.textContent = "What brought you here?";
      copy.textContent = "A clear purpose can keep a quick visit from becoming an unplanned session.";
      keep.disabled = true;
      input.addEventListener("input", () => { keep.disabled = !input.value.trim(); });
    } else {
      title.textContent = "Try a small switch.";
      copy.textContent = result.alternative;
    }
    box.append(brand, title, copy);
    if (result.action === "purpose") box.append(input);
    box.append(leave, keep, intentional, note);
    card.append(box);
    root.append(card);
    const finish = async (decision) => {
      clearInterval(timer);
      await send({ type: "DECISION", trialId: result.trialId, decision });
      overlayActive = false;
      host.remove();
      if (decision === "leave") window.location.replace("about:blank");
    };
    leave.addEventListener("click", () => finish("leave"));
    keep.addEventListener("click", () => finish("continue"));
    intentional.addEventListener("click", () => finish("intentional"));
  }

  const visit = () => send({ type: "VISIT" }).then(showPrompt);
  visit();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) visit();
  });
  setInterval(() => {
    if (!document.hidden && document.hasFocus() && !overlayActive) {
      send({ type: "HEARTBEAT", visible: true });
    }
  }, 5000);
})();
