const DATA_URL = "data/volunteers.json";

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

function renderDateRow(entry) {
  const pct = entry.total_count > 0
    ? Math.round((entry.filled_count / entry.total_count) * 100)
    : 0;

  const eventNumHtml = entry.event_number
    ? `<span class="event-num">#${entry.event_number}</span>`
    : "";

  const rolesHtml = entry.vacant_roles
    .map((r) => `<span class="role-tag">${r}</span>`)
    .join("");

  return `
    <div class="date-row">
      <div class="date-meta">
        <span class="date-label">${formatDate(entry.date)}</span>
        ${eventNumHtml}
      </div>
      <div class="fill-bar-wrap">
        <div class="fill-bar">
          <div class="fill-bar-inner" style="width:${pct}%"></div>
        </div>
        <span class="fill-label">${entry.filled_count}/${entry.total_count} filled</span>
      </div>
      <div class="roles-list">${rolesHtml}</div>
    </div>`;
}

function renderEvent(event) {
  const bodyHtml = event.scrape_ok === false
    ? `<div class="error-badge">Could not fetch data: ${event.error || "unknown error"}</div>`
    : event.upcoming_with_vacancies.length === 0
    ? `<div class="no-vacancies">No upcoming vacancies found.</div>`
    : event.upcoming_with_vacancies.map(renderDateRow).join("");

  return `
    <div class="event-card">
      <div class="event-header">
        <span class="event-name">${event.name} parkrun</span>
        <a class="event-link" href="${event.url}" target="_blank" rel="noopener">
          Volunteer page ↗
        </a>
      </div>
      ${bodyHtml}
    </div>`;
}

async function init() {
  const app = document.getElementById("app");
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    document.getElementById("last-updated").textContent = formatUpdated(data.last_updated);

    if (!data.events || data.events.length === 0) {
      app.innerHTML = `<p class="no-data">No data yet — the scraper hasn't run. Trigger it manually via GitHub Actions.</p>`;
      return;
    }

    app.innerHTML = data.events.map(renderEvent).join("");
  } catch (err) {
    app.innerHTML = `<p class="no-data">Failed to load data: ${err.message}</p>`;
  }
}

init();
