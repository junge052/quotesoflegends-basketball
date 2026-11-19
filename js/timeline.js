const timeline = document.getElementById("timeline");
const viewport = document.getElementById("timeline-scroll");
const years = document.getElementById("timeline-years");
const scrub = document.getElementById("timeline-scrub");
const previewDate = document.getElementById("preview-date");
const previewSpeaker = document.getElementById("preview-speaker");
const previewQuote = document.getElementById("preview-quote");
const months = document.getElementById("timeline-months");
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
let activeLink;

for (const month of monthNames) {
  const label = document.createElement("span");
  label.textContent = month;
  months.append(label);
}

function showQuote(quote, mark) {
  activeLink?.classList.remove("active-mark");
  mark.classList.add("active-mark");
  activeLink = mark;
  previewDate.textContent = formatDate.format(new Date(quote.date));
  previewSpeaker.textContent = quote.speaker;
  previewQuote.textContent = "“" + quote.text + "”";
}

function updateScrub() {
  const distance = viewport.scrollWidth - viewport.clientWidth;
  scrub.value = distance > 0 ? Math.round(viewport.scrollLeft / distance * Number(scrub.max)) : 0;
  scrub.disabled = distance <= 0;
}

viewport.addEventListener("scroll", updateScrub, { passive: true });
new ResizeObserver(updateScrub).observe(viewport);
scrub.addEventListener("input", () => {
  viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) * Number(scrub.value) / Number(scrub.max);
});

export function renderTimeline(index, selectedYear, order) {
  timeline.hidden = index.size === 0;
  activeLink = null;
  if (!index.size) {
    years.replaceChildren();
    return;
  }

  const firstYear = 1970;
  const lastYear = 2026;
  const yearRange = selectedYear ? [Number(selectedYear)] :
    Array.from({ length: lastYear - firstYear + 1 }, (_, i) => order === "desc" ? lastYear - i : firstYear + i);
  years.style.setProperty("--year-count", yearRange.length);
  const columns = document.createDocumentFragment();
  let initialQuote;
  let initialMark;
  for (const year of yearRange) {
    const column = document.createElement("div");
    column.className = "timeline-year";
    const entries = index.get(String(year)) ?? [];
    const axis = document.createElement("span");
    axis.className = "timeline-year-label";
    if (yearRange.length === 1 || year % 5 === 0 || year === lastYear) {
      axis.textContent = year;
    }
    for (let month = 1; month <= 12; month++) {
      const cell = document.createElement("div");
      cell.className = "timeline-cell";
      for (const quote of entries.filter(entry => entry.month === month)) {
        const mark = document.createElement("a");
        mark.className = "timeline-mark";
        mark.href = "#quote/" + quote.id;
        mark.setAttribute("aria-label", quote.speaker + ", " + formatDate.format(new Date(quote.date)) + ": " + quote.text);
        mark.addEventListener("pointerenter", () => showQuote(quote, mark));
        mark.addEventListener("focus", () => showQuote(quote, mark));
        cell.append(mark);
        if (!initialMark) {
          initialQuote = quote;
          initialMark = mark;
        }
      }
      column.append(cell);
    }
    column.append(axis);
    columns.append(column);
  }
  years.replaceChildren(columns);
  if (initialMark) {
    showQuote(initialQuote, initialMark);
    viewport.scrollLeft = Math.max(0, initialMark.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft - viewport.clientWidth / 2);
  }
  updateScrub();
}
