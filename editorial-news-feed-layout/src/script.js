const STORAGE_KEY = "vanaheim-feed-state";

const feed = document.querySelector("#feed");
const searchInput = document.querySelector("#feed-search");
const searchSuggestions = document.querySelector("#search-suggestions");
const sortSelect = document.querySelector("#feed-sort");
const restoreButton = document.querySelector("#restore-feed");
const emptyState = document.querySelector("#empty-state");
const visibleCount = document.querySelector("#visible-count");
const readCount = document.querySelector("#read-count");
const savedCount = document.querySelector("#saved-count");
const densityControls = document.querySelectorAll("input[name='density']");
const stories = Array.from(document.querySelectorAll("#feed .story"));

const state = loadState();
const suggestionItems = getSuggestionItems(stories);
let activeSuggestionIndex = -1;

stories.forEach((story) => {
  const actions = document.createElement("div");
  actions.className = "story-actions";
  actions.innerHTML = `
    <button class="story-action" type="button" data-action="open">Číst dál</button>
    <button class="story-action" type="button" data-action="read">Přečteno</button>
    <button class="story-action" type="button" data-action="save">Uložit</button>
    <button class="story-action" type="button" data-action="dismiss">Skrýt</button>
  `;
  story.querySelector(".story-content").append(actions);
});

feed.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const story = button.closest(".story");
  const id = story.dataset.id;
  const action = button.dataset.action;

  if (action === "open") {
    button.blur();
    return;
  }

  if (action === "read") {
    toggleId(state.read, id);
    saveState();
    updateStoryState(story);
    updateStats();
    return;
  }

  if (action === "save") {
    toggleId(state.saved, id);
    saveState();
    updateStoryState(story);
    updateStats();
    return;
  }

  if (action === "dismiss") {
    addId(state.hidden, id);
    saveState();
    renderFeed();
  }
});

searchInput.addEventListener("input", () => {
  renderSuggestions();
  renderFeed();
});

searchInput.addEventListener("focus", renderSuggestions);
searchInput.addEventListener("keydown", handleSuggestionKeys);
searchInput.addEventListener("blur", () => {
  window.setTimeout(closeSuggestions, 130);
});

searchSuggestions.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

searchSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest(".search-suggestion");
  if (!button) return;

  searchInput.value = button.dataset.value;
  closeSuggestions();
  renderFeed();
  searchInput.focus();
});

sortSelect.addEventListener("change", () => renderFeed({ reorder: true }));
restoreButton.addEventListener("click", () => {
  state.hidden = [];
  saveState();
  renderFeed();
});

densityControls.forEach((control) => {
  control.addEventListener("change", () => {
    document.body.classList.toggle(
      "compact",
      control.value === "compact" && control.checked
    );
  });
});

renderFeed({ reorder: true });

function renderFeed({ reorder = false } = {}) {
  const query = searchInput.value.trim().toLowerCase();
  const sortedStories = sortStories(stories, sortSelect.value);
  let shown = 0;

  if (reorder) {
    sortedStories.forEach((story) => feed.append(story));
  }

  sortedStories.forEach((story) => {
    const id = story.dataset.id;
    const isHidden = state.hidden.includes(id);
    const matchesSearch = !query || getStoryText(story).includes(query);
    const shouldShow = !isHidden && matchesSearch;

    story.hidden = !shouldShow;
    updateStoryState(story);

    if (shouldShow) shown += 1;
  });

  updateStats(shown);
  emptyState.hidden = shown !== 0;
  restoreButton.disabled = state.hidden.length === 0;
}

function updateStoryState(story) {
  const isRead = state.read.includes(story.dataset.id);
  const isSaved = state.saved.includes(story.dataset.id);

  story.classList.toggle("is-read", isRead);
  story.classList.toggle("is-saved", isSaved);
  syncButton(story, "read", "Přečteno", isRead);
  syncButton(story, "save", isSaved ? "Uloženo" : "Uložit", isSaved);
}

function updateStats(visibleOverride) {
  const visible =
    typeof visibleOverride === "number"
      ? visibleOverride
      : stories.filter((story) => !story.hidden).length;

  visibleCount.textContent = visible;
  readCount.textContent = state.read.length;
  savedCount.textContent = state.saved.length;
}

function sortStories(items, mode) {
  return [...items].sort((a, b) => {
    if (mode === "oldest") {
      return getDate(a) - getDate(b);
    }

    if (mode === "source") {
      return a.dataset.source.localeCompare(b.dataset.source);
    }

    if (mode === "title") {
      return getTitle(a).localeCompare(getTitle(b));
    }

    return getDate(b) - getDate(a);
  });
}

function getDate(story) {
  const dateEl = story.querySelector(".pub-date");
  return dateEl ? new Date(dateEl.getAttribute("datetime")).getTime() : 0;
}

function getTitle(story) {
  const heading = story.querySelector("h3");
  return heading ? heading.textContent.trim() : "";
}

function getStoryText(story) {
  const dek = story.querySelector(".dek");
  return [
    story.dataset.source,
    story.dataset.tags,
    getTitle(story),
    dek ? dek.textContent : "",
    story.querySelector(".story-categories")?.textContent ?? ""
  ]
    .join(" ")
    .toLowerCase();
}

function syncButton(story, action, label, pressed) {
  const button = story.querySelector(`[data-action="${action}"]`);
  button.textContent = label;
  button.setAttribute("aria-pressed", String(pressed));
}

function toggleId(list, id) {
  if (list.includes(id)) {
    list.splice(list.indexOf(id), 1);
    return;
  }

  list.push(id);
}

function addId(list, id) {
  if (!list.includes(id)) {
    list.push(id);
  }
}

function getSuggestionItems(items) {
  const terms = new Map();

  items.forEach((story) => {
    const source = story.dataset.source;
    const title = getTitle(story);
    const searchText = getStoryText(story);

    terms.set(source.toLowerCase(), {
      value: source,
      kind: "autor",
      searchText
    });
    terms.set(title.toLowerCase(), { value: title, kind: "příspěvek", searchText });
  });

  return Array.from(terms.values());
}

function renderSuggestions() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    closeSuggestions();
    return;
  }

  const matches = suggestionItems
    .filter(
      (item) =>
        item.value.toLowerCase().includes(query) ||
        item.searchText.includes(query)
    )
    .sort((a, b) => {
      const aStarts = a.value.toLowerCase().startsWith(query);
      const bStarts = b.value.toLowerCase().startsWith(query);

      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.value.localeCompare(b.value);
    })
    .slice(0, 6);

  if (matches.length === 0) {
    closeSuggestions();
    return;
  }

  activeSuggestionIndex = -1;
  searchInput.setAttribute("aria-expanded", "true");
  searchSuggestions.hidden = false;
  searchSuggestions.classList.remove("is-above");
  searchSuggestions.innerHTML = matches
    .map(
      (item, index) => `
    <button class="search-suggestion" type="button" role="option" data-index="${index}" data-value="${escapeAttribute(
        item.value
      )}">
      <span>${escapeHtml(item.value)}</span>
      <span class="suggestion-kind">${item.kind}</span>
    </button>
  `
    )
    .join("");

  const menuBox = searchSuggestions.getBoundingClientRect();
  const inputBox = searchInput.getBoundingClientRect();
  const roomAbove = inputBox.top;
  const roomBelow = window.innerHeight - inputBox.bottom;

  searchSuggestions.classList.toggle(
    "is-above",
    menuBox.height > roomBelow && roomAbove > roomBelow
  );
}

function handleSuggestionKeys(event) {
  const options = Array.from(
    searchSuggestions.querySelectorAll(".search-suggestion")
  );

  if (searchSuggestions.hidden || options.length === 0) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    setActiveSuggestion(
      Math.min(activeSuggestionIndex + 1, options.length - 1)
    );
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setActiveSuggestion(Math.max(activeSuggestionIndex - 1, 0));
  }

  if (event.key === "Enter" && activeSuggestionIndex > -1) {
    event.preventDefault();
    searchInput.value = options[activeSuggestionIndex].dataset.value;
    closeSuggestions();
    renderFeed();
  }

  if (event.key === "Escape") {
    closeSuggestions();
  }
}

function setActiveSuggestion(index) {
  const options = Array.from(
    searchSuggestions.querySelectorAll(".search-suggestion")
  );
  activeSuggestionIndex = index;

  options.forEach((option, optionIndex) => {
    option.classList.toggle("is-active", optionIndex === index);
  });
}

function closeSuggestions() {
  activeSuggestionIndex = -1;
  searchInput.setAttribute("aria-expanded", "false");
  searchSuggestions.hidden = true;
  searchSuggestions.classList.remove("is-above");
  searchSuggestions.innerHTML = "";
}

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character])
  );
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      read: Array.isArray(parsed?.read) ? parsed.read : [],
      saved: Array.isArray(parsed?.saved) ? parsed.saved : [],
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden : []
    };
  } catch {
    return { read: [], saved: [], hidden: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
