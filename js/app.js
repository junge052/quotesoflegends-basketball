import { jumpTo, refreshScroll, setPageScrollLocked } from "./scroll.js";
import { renderBasketball, isBasketballView } from "./basketball.js";
import { renderTimeline } from "./timeline.js";
import { sources } from "./sources.js";

const get = id => document.getElementById(id);
const search = get("search");
const yearFilter = get("year");
const order = get("order");
const clear = get("clear");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
let quotes = [];

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value != null) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function link(value, href, className) {
  const node = element("a", value, className);
  node.href = href;
  return node;
}

function normalize(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[’‘]/g, "'");
}

function renderArchive() {
  const query = normalize(search.value.trim());
  const filtered = quotes.filter(quote =>
    (!yearFilter.value || quote.year === yearFilter.value) && quote.searchText.includes(query)
  );
  if (order.value === "desc") filtered.reverse();

  get("count").textContent = filtered.length === 1 ? "1 quotation" : filtered.length + " quotations";
  clear.hidden = !search.value && !yearFilter.value && order.value === "asc";
  const index = new Map();
  for (const quote of filtered) {
    if (!index.has(quote.year)) index.set(quote.year, []);
    index.get(quote.year).push(quote);
  }

  renderTimeline(index, yearFilter.value, order.value);
  renderBasketball(index);
  if (isBasketballView()) get("timeline").hidden = true;

  const years = element("div", null, "years");
  for (const [year, entries] of index) {
    const section = element("section", null, "year-block");
    section.append(element("h3", year));
    const months = element("div", null, "months");
    for (let number = 1; number <= 12; number++) {
      const entry = entries.find(quote => quote.month === number);
      if (!entry) {
        months.append(element("span", number));
        continue;
      }
      const month = link(number, "#row-" + entry.id);
      month.setAttribute("aria-label", new Intl.DateTimeFormat("en-US", {month:"long",timeZone:"UTC"}).format(new Date(entry.date)) + " " + year);
      months.append(month);
    }
    section.append(months);
    for (const quote of entries) {
      const row = element("div", null, "quote-row");
      row.id = "row-" + quote.id;
      const time = element("time", quote.date.slice(5).replace("-", "/"), "quote-date");
      time.dateTime = quote.date;
      const content = link(null, "#quote/" + quote.id, "quote-row-content");
      content.append(element("strong", "“" + quote.text + "”"), element("cite", quote.speaker));
      row.append(time, content);
      section.append(row);
    }
    years.append(section);
  }
  get("entries").replaceChildren(filtered.length ? years : element("p", "No quotes match your search."));
}

let quoteLayoutObserver;

function fitOpenQuote(spread) {
  const band = spread.querySelector(".spread-quote");
  const text = band.querySelector(".quote-text");
  const blockquote = band.querySelector("blockquote");
  blockquote.style.removeProperty("font-size");
  if (!spread.querySelector(".feature-toggle[aria-expanded=true]")) return;

  const styles = getComputedStyle(band);
  const available = band.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
  if (available <= 0 || text.offsetHeight <= available) return;

  let lower = 1;
  let upper = parseFloat(getComputedStyle(blockquote).fontSize);
  while (upper - lower > .25) {
    const size = (lower + upper) / 2;
    blockquote.style.fontSize = size + "px";
    if (text.offsetHeight <= available) lower = size;
    else upper = size;
  }
  blockquote.style.fontSize = lower + "px";
}

function setPanelOpen(toggle, open) {
  const drawer = get(toggle.getAttribute("aria-controls"));
  toggle.setAttribute("aria-expanded", String(open));
  if (!open && drawer.contains(document.activeElement)) toggle.focus({preventScroll:true});
  drawer.inert = !open;
  const spread = toggle.closest(".spread");
  const openPanels = spread.querySelectorAll(".feature-toggle[aria-expanded=true]").length;
  spread.querySelector(".quote-trigger").setAttribute("aria-expanded", String(openPanels === 2));
  setPageScrollLocked(openPanels > 0);
  fitOpenQuote(spread);
}

document.addEventListener("click", event => {
  if (event.target.closest(".feature-panel, .quote-trigger, .pager, #about-link, #about")) return;
  for (const toggle of document.querySelectorAll("#detail:not([hidden]) .feature-toggle[aria-expanded=true]")) {
    setPanelOpen(toggle, false);
  }
});

function sourcePanel(side, title, items, gameUrl) {
  const panel = element("aside", null, "feature-panel " + side);
  const toggle = element("button", title, "feature-toggle");
  const content = element("div", null, "feature-content");
  content.tabIndex = 0;
  content.setAttribute("data-lenis-prevent", "");
  panel.setAttribute("aria-label", title);
  const drawer = element("div", null, "feature-drawer");
  drawer.id = side + "-content";
  drawer.inert = true;
  drawer.append(content);
  toggle.type = "button";
  toggle.setAttribute("aria-controls", drawer.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    setPanelOpen(toggle, toggle.getAttribute("aria-expanded") === "false");
    refreshScroll();
  });
  panel.append(toggle, drawer);
  for (const item of items) {
    const section = element("section", null, "source-section");
    const body = element("div");
    body.append(element("h2", item.title));
    if (item.byline) body.append(element("p", item.byline, "source-label"));
    if (item.context) body.append(element("p", item.context));
    if (item.turns) {
      const transcript = element("dl", null, "transcript");
      for (const [speaker, text] of item.turns) {
        const initials = speaker.split(/\s+/).map(part => part[0]).join("");
        const label = element("dt", initials);
        label.title = speaker;
        label.setAttribute("aria-label", speaker);
        transcript.append(label, element("dd", text));
      }
      body.append(element("h3", "Transcript excerpt"), transcript);
    }
    for (const photo of item.images ?? []) {
      const figure = element("figure");
      const img = element("img");
      img.src = photo.src;
      img.alt = photo.alt;
      img.loading = "lazy";
      figure.append(img);
      if (photo.caption) figure.append(element("figcaption", photo.caption));
      body.append(figure);
    }
    if (item.url) body.append(link("View original source", item.url));
    section.append(element("div", item.type.toUpperCase(), "source-label"), body);
    content.append(section);
  }
  if (gameUrl) content.append(link("Game record", gameUrl, "game-record"));
  if (!items.length && !gameUrl) {
    content.append(element("p", side === "interview" ? "Interview unavailable." : "Additional information unavailable."));
  }
  return panel;
}

let renderedQuote;

function renderDetail(quote) {
  const detail = get("detail");
  const material = sources[quote.date];
  const spread = element("section", null, "spread");
  const main = element("div", null, "feature-main");
  const quotation = element("div", null, "spread-quote");
  const blockquote = element("blockquote");
  const quoteTrigger = element("button", null, "quote-trigger");
  quoteTrigger.append(element("span", "“" + quote.text + "”", "quote-text"));
  quoteTrigger.type = "button";
  quoteTrigger.setAttribute("aria-controls", "interview-content information-content");
  quoteTrigger.setAttribute("aria-expanded", "false");
  quoteTrigger.setAttribute("aria-label", quoteTrigger.textContent + " Open Interview and More Information");
  quoteTrigger.addEventListener("click", () => {
    for (const toggle of spread.querySelectorAll(".feature-toggle")) {
      setPanelOpen(toggle, true);
    }
    refreshScroll();
  });
  spread.classList.toggle("long-quote", quote.text.length > 175);
  blockquote.append(quoteTrigger);
  quotation.append(blockquote);
  const meta = element("div", null, "metadata");
  const time = element("time", dateFormat.format(new Date(quote.date)));
  time.dateTime = quote.date;
  const speaker = element("h1");
  speaker.append(element("span", quote.speaker));
  meta.append(element("p", "Speaker", "speaker-label"), speaker, time);
  if (material?.matchup) {
    meta.append(element("p", material.matchup), element("p", [material.venue, material.location].filter(Boolean).join(" · "), "feature-location"));
    if (material.event) meta.append(element("p", material.event, "game-record"));
  } else {
    meta.append(element("p", "Game details unavailable.", "game-record"));
  }
  const pager = element("nav", null, "pager");
  pager.setAttribute("aria-label", "Adjacent quotations");
  const index = quotes.indexOf(quote);
  const previousQuote = renderedQuote;
  renderedQuote = quote;
  const adjacent = (label, entry, direction) => {
    if (!entry) return element("span");
    const anchor = link(label, "#quote/" + entry.id);
    const arrow = element("span", direction === "previous" ? "←" : "→");
    arrow.setAttribute("aria-hidden", "true");
    if (direction === "previous") anchor.prepend(arrow, " ");
    else anchor.append(" ", arrow);
    return anchor;
  };
  pager.append(adjacent("Previous quote", quotes[index - 1], "previous"), adjacent("Next quote", quotes[index + 1], "next"));
  const footer = element("div", "Ellina Jung © 2026", "feature-footer");
  main.append(meta, quotation, pager);
  const items = material?.items ?? [];
  spread.append(
    sourcePanel("interview", "Interview", items.filter(item => /interview/i.test(item.type))),
    main,
    sourcePanel("information", "More Information", items.filter(item => !/interview/i.test(item.type)), material?.gameUrl),
    footer
  );
  if (previousQuote) {
    const current = detail.querySelector(".spread");
    current.classList.toggle("long-quote", quote.text.length > 175);
    const currentButton = current.querySelector(".quote-trigger");
    currentButton.replaceChildren(...quoteTrigger.childNodes);
    currentButton.setAttribute("aria-label", quoteTrigger.getAttribute("aria-label"));
    const currentMeta = current.querySelector(".metadata");
    currentMeta.replaceChildren(...meta.childNodes);
    const currentPager = current.querySelector(".pager");
    for (const [i, next] of Array.from(pager.children).entries()) {
      const existing = currentPager.children[i];
      if (existing.matches("a") && next.matches("a")) existing.href = next.href;
      else if (existing.tagName !== next.tagName) existing.replaceWith(next);
    }
    for (const side of ["interview", "information"]) {
      const content = current.querySelector("." + side + " .feature-content");
      content.replaceChildren(...spread.querySelector("." + side + " .feature-content").childNodes);
      content.scrollTop = 0;
    }
    if (previousQuote !== quote && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const offset = index > quotes.indexOf(previousQuote) ? "24px" : "-24px";
      for (const text of current.querySelectorAll(".quote-text, .metadata h1 span, .metadata time, .metadata p:not(.speaker-label)")) {
        text.animate([{opacity:0, transform:"translateX(" + offset + ")"}, {opacity:1, transform:"translateX(0)"}],
          {duration:650, easing:"cubic-bezier(.16,1,.3,1)"});
      }
    }
    fitOpenQuote(current);
    refreshScroll();
    return;
  }
  detail.replaceChildren(spread);
  const header = document.querySelector(".top");
  quoteLayoutObserver = new ResizeObserver(() => {
    spread.style.setProperty("--feature-nav-height", header.offsetHeight + "px");
    fitOpenQuote(spread);
    const band = quotation.getBoundingClientRect();
    const center = band.top - spread.getBoundingClientRect().top + band.height / 2;
    spread.style.setProperty("--quote-center", center + "px");
    spread.style.setProperty("--quote-band-height", band.height + "px");
  });
  quoteLayoutObserver.observe(header);
  quoteLayoutObserver.observe(meta);
  quoteLayoutObserver.observe(quotation);
  spread.addEventListener("transitionend", refreshScroll);
}

const about = get("about");

get("about-link").addEventListener("click", event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (!about.open) about.showModal();
});
let pressedBackdrop = false;
about.addEventListener("pointerdown", event => {
  pressedBackdrop = event.target === about;
});
about.addEventListener("click", event => {
  if (pressedBackdrop && event.target === about) about.close();
  pressedBackdrop = false;
  const browse = event.target.closest('a[href="#chronology"]');
  if (browse) {
    about.close();
    if (location.hash === "#chronology") route();
  }
});
about.addEventListener("close", () => {
  if (["#about", "#foreword"].includes(location.hash)) history.replaceState(null, "", "#home");
  refreshScroll();
});

function route() {
  const hash = location.hash.slice(1);
  const showAbout = hash === "about" || hash === "foreword";
  if (!showAbout && about.open) about.close();
  const id = hash.startsWith("quote/") ? hash.slice(6) : null;
  const quote = id ? quotes.find(entry => entry.id === id) : null;
  const updatingQuote = Boolean(quote && renderedQuote);
  if (!quote) {
    setPageScrollLocked(false);
    renderedQuote = undefined;
    quoteLayoutObserver?.disconnect();
  }
  get("detail").hidden = !id;
  get("cover").hidden = Boolean(id);
  get("chronology").hidden = Boolean(id);
  document.title = quote ? quote.speaker + " — Quotes of Legends" : "Quotes of Legends — Basketball";
  if (id) {
    if (quote) renderDetail(quote);
    else get("detail").replaceChildren(link("Back to chronology", "#chronology", "back"), element("p", "Quote not found.", "back"));
  }
  if (updatingQuote) return;
  if (hash.startsWith("row-") && isBasketballView()) get("linear-view").click();
  if (hash.startsWith("row-") && !get(hash)) {
    search.value = "";
    yearFilter.value = "";
    renderArchive();
  }
  const target = showAbout ? null : get(hash);
  jumpTo(id || hash === "home" ? null : target);
  if (showAbout && !about.open) about.showModal();
}

const suggestions = get("search-suggestions");
let suggestionValues = [];
let activeSuggestion = -1;

function closeSuggestions() {
  suggestions.hidden = true;
  search.setAttribute("aria-expanded", "false");
  search.removeAttribute("aria-activedescendant");
  activeSuggestion = -1;
}

function showSuggestions() {
  closeSuggestions();
  const query = normalize(search.value.trim());
  if (!query) return;

  const candidates = quotes.filter(quote => !yearFilter.value || quote.year === yearFilter.value);
  const speakers = [...new Set(candidates.map(quote => quote.speaker))]
    .filter(speaker => normalize(speaker).includes(query))
    .sort((a,b) => Number(normalize(b).startsWith(query)) - Number(normalize(a).startsWith(query)) || a.localeCompare(b));
  const matches = candidates.filter(quote => normalize(quote.text).includes(query));
  const options = [
    ...speakers.slice(0, matches.length ? 3 : 6).map(speaker => ({value:speaker, label:speaker, caption:"Speaker"})),
    ...matches.map(quote => ({value:quote.text, label:"“" + quote.text + "”", caption:quote.speaker + " · " + quote.year}))
  ].slice(0, 6);
  if (!options.length) return;

  suggestionValues = options.map(option => option.value);
  suggestions.replaceChildren(...options.map((option, index) => {
    const row = element("li");
    row.id = "search-option-" + index;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.append(element("span", option.label), element("small", option.caption));
    row.addEventListener("click", () => chooseSuggestion(index));
    return row;
  }));
  suggestions.hidden = false;
  search.setAttribute("aria-expanded", "true");
}

function chooseSuggestion(index) {
  search.value = suggestionValues[index];
  closeSuggestions();
  renderArchive();
}

search.addEventListener("input", event => {
  if (event.isComposing) return;
  renderArchive();
  showSuggestions();
});
search.addEventListener("compositionend", () => {
  renderArchive();
  showSuggestions();
});
search.addEventListener("focus", showSuggestions);
search.addEventListener("blur", closeSuggestions);
suggestions.addEventListener("mousedown", event => event.preventDefault());
search.addEventListener("keydown", event => {
  if (event.isComposing) return;
  if (event.key === "Escape" && !suggestions.hidden) {
    event.preventDefault();
    closeSuggestions();
  } else if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault();
    chooseSuggestion(activeSuggestion);
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (suggestions.hidden) showSuggestions();
    if (suggestions.hidden) return;
    event.preventDefault();
    const rows = suggestions.children;
    if (activeSuggestion >= 0) rows[activeSuggestion].setAttribute("aria-selected", "false");
    const step = event.key === "ArrowDown" ? 1 : -1;
    const start = activeSuggestion < 0 && step === -1 ? 0 : activeSuggestion;
    activeSuggestion = (start + step + rows.length) % rows.length;
    const row = rows[activeSuggestion];
    row.setAttribute("aria-selected", "true");
    search.setAttribute("aria-activedescendant", row.id);
    row.scrollIntoView({block:"nearest"});
  }
});
yearFilter.addEventListener("change", renderArchive);
order.addEventListener("change", renderArchive);
clear.addEventListener("click", () => {
  search.value = "";
  yearFilter.value = "";
  order.value = "asc";
  renderArchive();
  search.focus();
});

try {
  const response = await fetch(new URL("../data/quotes.txt", import.meta.url));
  if (!response.ok) throw new Error("Archive unavailable");
  const text = await response.text();
  quotes = text.trim().split("\n").map(line => {
    const [date, speaker, text] = line.split("|");
    const slug = normalize(speaker).replace(/[^a-z0-9]+/g, "-");
    return {date, speaker, text, id:date + "-" + slug, year:date.slice(0,4), month:Number(date.slice(5,7)), searchText:normalize([date, speaker, text].join(" "))};
  }).sort((first, second) => first.date.localeCompare(second.date));

  for (const year of new Set(quotes.map(quote => quote.year))) {
    const option = element("option", year);
    option.value = year;
    yearFilter.append(option);
  }
  renderArchive();
  window.addEventListener("hashchange", route);
  route();
} catch (error) {
  get("count").textContent = "The chronology couldn’t load. Reload to try again.";
  console.error(error);
}
