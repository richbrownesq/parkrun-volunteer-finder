const DATA_URL = "data/volunteers.json";

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function formatUpdated(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return `Last updated: ${d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  })}`;
}

function isThisWeekend(isoDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const diff = Math.round((d - today) / 86400000);
  return diff >= 0 && diff <= 6;
}

// ── Shared components ───────────────────────────────────────────────────────

function fillBarHtml(filled, total) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return `
    <div class="fill-bar-wrap">
      <div class="fill-bar"><div class="fill-bar-inner" style="width:${pct}%"></div></div>
      <span class="fill-label">${filled}/${total} filled</span>
    </div>`;
}

function rolesHtml(roles) {
  return `<div class="roles-list">${roles.map((r) => `<span class="role-tag">${r}</span>`).join("")}</div>`;
}

// ── By-date view ────────────────────────────────────────────────────────────

function buildDateIndex(events) {
  const index = {};
  for (const event of events) {
    if (!event.scrape_ok) continue;
    for (const entry of event.upcoming_with_vacancies) {
      if (!index[entry.date]) index[entry.date] = [];
      index[entry.date].push({ event, entry });
    }
  }
  return index;
}

function renderByDate(events) {
  const index = buildDateIndex(events);
  const dates = Object.keys(index).sort();

  if (dates.length === 0) {
    return `<p class="no-data">No vacancies found across any events.</p>`;
  }

  return dates.map((date) => {
    const thisWeekend = isThisWeekend(date);
    const badge = thisWeekend ? `<span class="this-week-badge">This Saturday</span>` : "";

    const eventRows = index[date].map(({ event, entry }) => `
      <div class="event-row">
        <div class="event-row-header">
          <span class="event-row-name">${event.name}</span>
          <a class="event-link" href="${event.url}" target="_blank" rel="noopener">Volunteer ↗</a>
        </div>
        ${fillBarHtml(entry.filled_count, entry.total_count)}
        ${rolesHtml(entry.vacant_roles)}
      </div>`).join("");

    return `
      <div class="date-card${thisWeekend ? " date-card--highlight" : ""}">
        <div class="date-card-header">
          <span class="date-card-label">${formatDateShort(date)}</span>
          ${badge}
        </div>
        ${eventRows}
      </div>`;
  }).join("");
}

// ── By-event view ───────────────────────────────────────────────────────────

function renderDateRow(entry) {
  return `
    <div class="date-row">
      <div class="date-meta">
        <span class="date-label">${formatDate(entry.date)}</span>
      </div>
      ${fillBarHtml(entry.filled_count, entry.total_count)}
      ${rolesHtml(entry.vacant_roles)}
    </div>`;
}

function renderByEvent(events) {
  return events.map((event) => {
    const bodyHtml = event.scrape_ok === false
      ? `<div class="error-badge">Could not fetch data: ${event.error || "unknown error"}</div>`
      : event.upcoming_with_vacancies.length === 0
      ? `<div class="no-vacancies">No upcoming vacancies found.</div>`
      : event.upcoming_with_vacancies.map(renderDateRow).join("");

    return `
      <div class="event-card">
        <div class="event-header">
          <span class="event-name">${event.name} parkrun</span>
          <a class="event-link" href="${event.url}" target="_blank" rel="noopener">Volunteer page ↗</a>
        </div>
        ${bodyHtml}
      </div>`;
  }).join("");
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function initTabs(events) {
  const app = document.getElementById("app");
  const buttons = document.querySelectorAll(".tab-btn");

  function showTab(tabId) {
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    app.innerHTML = tabId === "by-date" ? renderByDate(events) : renderByEvent(events);
  }

  buttons.forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

  // Default to by-date
  showTab("by-date");
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

async function init() {
  const app = document.getElementById("app");
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    document.getElementById("last-updated").textContent = formatUpdated(data.last_updated);

    if (!data.events || data.events.length === 0) {
      app.innerHTML = `<p class="no-data">No data yet — trigger the scraper via GitHub Actions.</p>`;
      return;
    }

    initTabs(data.events);
  } catch (err) {
    app.innerHTML = `<p class="no-data">Failed to load data: ${err.message}</p>`;
  }
}

init();
