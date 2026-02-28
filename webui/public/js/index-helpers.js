function escapeHtml(value) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setNowPlayingFile(fileName) {
  const displayName = fileName || "-";
  currentPlayingFileName = displayName;
  document.getElementById("nowPlayingFileValue").innerHTML = escapeHtml(displayName);
}

function encodePathForUrl(path) {
  const normalized = (path || "").replace(/\\/g, '/');
  return normalized
    .split('/')
    .map((segment, index) => (index === 0 && segment === "") ? "" : encodeURIComponent(segment))
    .join('/');
}

function getFolderKey(folder) {
  if (!folder) return "";
  return normalizePath(`${folder.baseDir || ""}/${folder.name || ""}`);
}

function isPlayingFolder(folder) {
  if (!folder || !currentPlayingFolderKey) return false;
  return getFolderKey(folder) === currentPlayingFolderKey;
}

function selectTagFilter(tagName) {
  if (!tagName) return;

  const tagFilter = document.getElementById("tagFilter");
  const hasOption = [...tagFilter.options].some(option => option.value === tagName);

  if (!hasOption) {
    const option = document.createElement("option");
    option.value = tagName;
    option.innerText = tagName;
    tagFilter.appendChild(option);
  }

  tagFilter.value = tagName;
  currentPage = 1;
  applyFolderFilters();
}

function resetAllFilters() {
  document.getElementById("folderSearch").value = "";
  document.getElementById("tagFilter").value = "";
  document.getElementById("multiTagSearch").value = "";
  selectedMultiTags = [];
  renderSelectedTagBadges();

  const suggestions = document.getElementById("multiTagSuggestions");
  suggestions.classList.add("hidden");
  suggestions.innerHTML = "";

  currentPage = 1;
  loadFolders(currentPage);
}

function collectFolderPaths(node, paths) {
  if (!node || !node.folders) return;

  [...node.folders.values()].forEach(folderNode => {
    paths.push(folderNode.path);
    collectFolderPaths(folderNode, paths);
  });
}

function getAllFolderPathsFromFiles(files) {
  const fileTree = buildFileTree(files || []);
  const folderPaths = [];
  collectFolderPaths(fileTree, folderPaths);
  return folderPaths;
}

function updateExpandAllButton() {
  const button = document.getElementById("expandAllFoldersBtn");
  if (!currentFolder) {
    button.disabled = true;
    button.innerText = "Expand All";
    return;
  }

  const allFolderPaths = getAllFolderPathsFromFiles(currentFolder.files || []);
  if (allFolderPaths.length === 0) {
    button.disabled = true;
    button.innerText = "Expand All";
    return;
  }

  button.disabled = false;
  const isFullyExpanded = allFolderPaths.every(path => expandedSubfolders.has(path));
  button.innerText = isFullyExpanded ? "Collapse All" : "Expand All";
}

function toggleExpandAllFolders() {
  if (!currentFolder) return;

  const allFiles = currentFolder.files || [];
  const allFolderPaths = getAllFolderPathsFromFiles(allFiles);
  if (allFolderPaths.length === 0) return;

  const isFullyExpanded = allFolderPaths.every(path => expandedSubfolders.has(path));
  expandedSubfolders = isFullyExpanded ? new Set() : new Set(allFolderPaths);

  renderMediaList(currentFolder, allFiles);
}

function setAvailableTagNames(folders) {
  const tagSet = new Set();
  folders.forEach(folder => {
    (folder.tags || []).forEach(tag => {
      if (tag?.enName) tagSet.add(tag.enName);
    });
  });

  availableTagNames = [...tagSet].sort((a, b) => a.localeCompare(b));
}

function renderSelectedTagBadges() {
  const container = document.getElementById("multiTagBadges");
  container.innerHTML = "";

  selectedMultiTags.forEach(tagName => {
    const badge = document.createElement("span");
    badge.className = "inline-flex items-center gap-1 text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded-full";
    badge.innerHTML = `
      <span>${escapeHtml(tagName)}</span>
      <button type="button" class="text-pink-500 hover:text-pink-700 leading-none" data-tag-remove="${escapeHtml(tagName)}">✕</button>
    `;
    container.appendChild(badge);
  });

  container.querySelectorAll("button[data-tag-remove]").forEach(button => {
    button.onclick = () => {
      removeMultiTagFilter(button.getAttribute("data-tag-remove"));
    };
  });
}

let multiTagHighlightedIndex = -1;

function getVisibleTagOptions() {
  const suggestions = document.getElementById("multiTagSuggestions");
  return [...suggestions.querySelectorAll("button[data-tag-option]")];
}

function applySuggestionHighlight() {
  const options = getVisibleTagOptions();

  if (options.length === 0) {
    multiTagHighlightedIndex = -1;
    return;
  }

  if (multiTagHighlightedIndex < 0 || multiTagHighlightedIndex >= options.length) {
    multiTagHighlightedIndex = 0;
  }

  options.forEach((option, index) => {
    option.classList.toggle("bg-pink-100", index === multiTagHighlightedIndex);
    option.classList.toggle("text-pink-700", index === multiTagHighlightedIndex);
  });

  options[multiTagHighlightedIndex].scrollIntoView({ block: "nearest" });
}

function renderTagSuggestions() {
  const input = document.getElementById("multiTagSearch");
  const suggestions = document.getElementById("multiTagSuggestions");

  if (document.activeElement !== input) {
    multiTagHighlightedIndex = -1;
    suggestions.classList.add("hidden");
    suggestions.innerHTML = "";
    return;
  }

  const keyword = input.value.trim().toLowerCase();

  const candidateTags = availableTagNames
    .filter(tag => !selectedMultiTags.includes(tag))
    .filter(tag => !keyword || tag.toLowerCase().includes(keyword))
    .slice(0, 20);

  if (candidateTags.length === 0) {
    multiTagHighlightedIndex = -1;
    suggestions.classList.add("hidden");
    suggestions.innerHTML = "";
    return;
  }

  suggestions.innerHTML = candidateTags
    .map(tag => `<button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-pink-50" data-tag-option="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`)
    .join("");

  suggestions.classList.remove("hidden");

  if (multiTagHighlightedIndex < 0) {
    multiTagHighlightedIndex = 0;
  }
  applySuggestionHighlight();

  suggestions.querySelectorAll("button[data-tag-option]").forEach(button => {
    button.onmousedown = event => {
      event.preventDefault();
      addMultiTagFilter(button.getAttribute("data-tag-option"));
    };
  });
}

function addMultiTagFilter(tagName) {
  if (!tagName || selectedMultiTags.includes(tagName)) return;

  selectedMultiTags.push(tagName);
  multiTagHighlightedIndex = -1;
  document.getElementById("multiTagSearch").value = "";
  renderSelectedTagBadges();
  renderTagSuggestions();
  currentPage = 1;
  applyFolderFilters();
}

function removeMultiTagFilter(tagName) {
  selectedMultiTags = selectedMultiTags.filter(tag => tag !== tagName);
  renderSelectedTagBadges();
  renderTagSuggestions();
  currentPage = 1;
  applyFolderFilters();
}

function setFolderFavoriteInMemory(folder, favorite) {
  if (!folder) return;

  folder.files = folder.files || [];
  const markerName = ".isfavorite";
  const markerIndex = folder.files.findIndex(file => normalizePath(file.path || file.name || "").toLowerCase() === markerName);

  if (favorite && markerIndex < 0) {
    folder.files.push({
      name: markerName,
      path: markerName,
      isDir: false,
    });
  }

  if (!favorite && markerIndex >= 0) {
    folder.files.splice(markerIndex, 1);
  }
}

function syncFavoriteStateByFolderName(folderName, favorite) {
  const updateList = folders => {
    (folders || []).forEach(folder => {
      if (folder?.name === folderName) {
        setFolderFavoriteInMemory(folder, favorite);
      }
    });
  };

  updateList(allFolders);
  updateList(allFoldersCache);

  if (currentFolder?.name === folderName) {
    setFolderFavoriteInMemory(currentFolder, favorite);
  }
}

function updateFavoriteToggleButton() {
  const button = document.getElementById("favoriteCurrentFolderBtn");
  if (!button) return;

  if (!currentFolder) {
    button.disabled = true;
    button.innerText = "☆ Favorite";
    return;
  }

  const favorite = isFolderFavorite(currentFolder);
  button.disabled = false;
  button.innerText = favorite ? "★ Favorited" : "☆ Favorite";
}

async function toggleFolderFavorite(folder) {
  if (!folder?.name) return;

  const nextFavorite = !isFolderFavorite(folder);
  const response = await fetch("/api/favorite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      folderName: folder.name,
      favorite: nextFavorite,
    }),
  });

  const json = await response.json();
  if (!response.ok || json?.code !== 200) {
    throw new Error(json?.msg || `HTTP ${response.status}`);
  }

  const favorite = !!json?.data?.favorite;
  const targetName = json?.data?.folderName || folder.name;
  syncFavoriteStateByFolderName(targetName, favorite);

  if (hasActiveFilters()) {
    await applyFolderFilters();
  } else {
    renderFolders(allFolders);
  }

  updateFavoriteToggleButton();
}

function initMultiTagFilter() {
  const input = document.getElementById("multiTagSearch");
  const suggestions = document.getElementById("multiTagSuggestions");

  input.addEventListener("input", () => {
    renderTagSuggestions();
  });

  input.addEventListener("focus", () => {
    renderTagSuggestions();
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement !== input) {
        suggestions.classList.add("hidden");
      }
    }, 0);
  });

  input.addEventListener("keydown", event => {
    const visibleOptions = getVisibleTagOptions();

    if (event.key === "Backspace" && !input.value.trim() && selectedMultiTags.length > 0) {
      event.preventDefault();
      removeMultiTagFilter(selectedMultiTags[selectedMultiTags.length - 1]);
      return;
    }

    if (event.key === "ArrowDown") {
      if (visibleOptions.length === 0) return;
      event.preventDefault();
      multiTagHighlightedIndex = (multiTagHighlightedIndex + 1 + visibleOptions.length) % visibleOptions.length;
      applySuggestionHighlight();
      return;
    }

    if (event.key === "ArrowUp") {
      if (visibleOptions.length === 0) return;
      event.preventDefault();
      multiTagHighlightedIndex = (multiTagHighlightedIndex - 1 + visibleOptions.length) % visibleOptions.length;
      applySuggestionHighlight();
      return;
    }

    if (event.key === "Escape") {
      multiTagHighlightedIndex = -1;
      suggestions.classList.add("hidden");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      const exactMatch = visibleOptions.find(option => option.getAttribute("data-tag-option").toLowerCase() === input.value.trim().toLowerCase());

      if (exactMatch) {
        addMultiTagFilter(exactMatch.getAttribute("data-tag-option"));
        return;
      }

      if (visibleOptions[multiTagHighlightedIndex]) {
        addMultiTagFilter(visibleOptions[multiTagHighlightedIndex].getAttribute("data-tag-option"));
        return;
      }

      if (visibleOptions.length > 0) {
        addMultiTagFilter(visibleOptions[0].getAttribute("data-tag-option"));
      }
    }
  });

  document.addEventListener("click", event => {
    if (!event.target.closest("#multiTagSearch") && !event.target.closest("#multiTagSuggestions")) {
      suggestions.classList.add("hidden");
    }
  });
}

async function fetchFolderPage(page, size) {
  const res = await fetch(`/api/list?page=${page}&pageSize=${size}`);
  const json = await res.json();
  return json.data;
}

async function ensureAllFoldersLoaded() {
  if (allFoldersCache) return allFoldersCache;

  const firstPage = await fetchFolderPage(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.pageSize));
  let merged = [...(firstPage.infos || [])];

  for (let page = 2; page <= totalPages; page++) {
    const data = await fetchFolderPage(page, pageSize);
    merged = merged.concat(data.infos || []);
  }

  allFoldersCache = merged;
  return allFoldersCache;
}

function updatePaginationState(page, totalPages) {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const safePage = Math.min(Math.max(1, page || 1), safeTotalPages);
  document.getElementById("pageInfo").innerText = `${safePage} / ${safeTotalPages}`;
  document.getElementById("prevPage").disabled = safePage <= 1;
  document.getElementById("nextPage").disabled = safePage >= safeTotalPages;
}

function updateFolderCountState(totalCount, options = {}) {
  const { filtered = false } = options;

  const container = document.getElementById("folderCountInfo");
  const dot = document.getElementById("folderCountDot");
  const label = document.getElementById("folderCountLabel");
  const value = document.getElementById("folderCountValue");
  if (!container || !dot || !label || !value) return;

  const safeCount = Number.isFinite(totalCount) ? Math.max(0, totalCount) : 0;
  label.innerText = filtered ? "Filtered folders" : "Total folders";
  value.innerText = safeCount.toLocaleString();

  container.classList.toggle("border-pink-200", filtered);
  container.classList.toggle("bg-pink-50", filtered);
  container.classList.toggle("text-pink-700", filtered);
  container.classList.toggle("border-gray-200", !filtered);
  container.classList.toggle("bg-white", !filtered);
  container.classList.toggle("text-gray-600", !filtered);

  dot.classList.toggle("bg-pink-400", filtered);
  dot.classList.toggle("bg-gray-300", !filtered);
  value.classList.toggle("text-pink-700", filtered);
  value.classList.toggle("text-gray-700", !filtered);
}

function hasActiveFilters() {
  const keyword = document.getElementById("folderSearch").value.trim();
  const selectedTag = document.getElementById("tagFilter").value;
  return !!keyword || !!selectedTag || selectedMultiTags.length > 0;
}

function renderTagFilterOptions(folders) {
  const tagFilter = document.getElementById("tagFilter");
  const currentValue = tagFilter.value;
  setAvailableTagNames(folders);
  const sortedTags = [...availableTagNames];
  tagFilter.innerHTML = '<option value="">— All —</option>';

  const favoriteOption = document.createElement("option");
  favoriteOption.value = "__favorites__";
  favoriteOption.innerText = "★ Favorites";
  tagFilter.appendChild(favoriteOption);

  sortedTags.forEach(tagName => {
    const option = document.createElement("option");
    option.value = tagName;
    option.innerText = tagName;
    tagFilter.appendChild(option);
  });

  tagFilter.value = sortedTags.includes(currentValue) ? currentValue : "";
  if (currentValue === "__favorites__") {
    tagFilter.value = "__favorites__";
  }

  selectedMultiTags = selectedMultiTags.filter(tag => sortedTags.includes(tag));
  renderSelectedTagBadges();
  renderTagSuggestions();
}

function isFolderFavorite(folder) {
  const markerName = ".isfavorite";
  return (folder.files || []).some(file => {
    const rawPath = normalizePath(file.path || file.name || "").toLowerCase();
    if (!rawPath) return false;
    return rawPath === markerName || rawPath.endsWith(`/${markerName}`);
  });
}

async function applyFolderFilters() {
  const searchInput = document.getElementById("folderSearch");
  const tagFilter = document.getElementById("tagFilter");
  const keyword = searchInput.value.trim().toLowerCase();
  const selectedTag = tagFilter.value;
  const selectedMultiTagSet = new Set(selectedMultiTags);

  if (!keyword && !selectedTag && selectedMultiTags.length === 0) {
    isFilterMode = false;
    await loadFolders(currentPage);
    return;
  }

  isFilterMode = true;

  document.getElementById("folderList").innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div></div>';

  let sourceFolders = [];
  try {
    sourceFolders = await ensureAllFoldersLoaded();
  } catch (err) {
    document.getElementById("folderList").innerHTML = `<div class="text-center py-10 text-red-400">过滤失败: ${err}</div>`;
    return;
  }

  renderTagFilterOptions(sourceFolders);

  const filteredFolders = sourceFolders.filter(folder => {
    const title = (folder.name || "").toLowerCase();
    const vaNames = (folder.vas || []).map(va => (va?.name || "").toLowerCase());
    const enTagNames = (folder.tags || []).map(tag => (tag?.enName || "").toLowerCase());
    const folderTagSet = new Set((folder.tags || []).map(tag => tag?.enName).filter(Boolean));

    const searchMatched = !keyword ||
      title.includes(keyword) ||
      vaNames.some(name => name.includes(keyword)) ||
      enTagNames.some(tag => tag.includes(keyword));

    const tagMatched = !selectedTag ||
      (selectedTag === "__favorites__"
        ? isFolderFavorite(folder)
        : (folder.tags || []).some(tag => tag?.enName === selectedTag));

    const multiTagMatched = selectedMultiTagSet.size === 0 || [...selectedMultiTagSet].every(tag => folderTagSet.has(tag));

    return searchMatched && tagMatched && multiTagMatched;
  });

  const totalPages = Math.max(1, Math.ceil(filteredFolders.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * pageSize;
  const pagedFolders = filteredFolders.slice(start, start + pageSize);

  renderFolders(pagedFolders);
  updatePaginationState(currentPage, totalPages);
  updateFolderCountState(filteredFolders.length, { filtered: true });
}
