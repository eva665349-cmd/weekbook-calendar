(() => {
  "use strict";

  const STORAGE_KEY = "weekbook-calendar-v1";
  const UNCATEGORIZED_TOKEN = "__none";
  const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const COLORS = ["#b7554d", "#3f6ea8", "#3d7b62", "#b5783e", "#765e9b", "#44413b"];
  const CATEGORY_PALETTE_V5 = {
    reading: { color: "#8B86BE", subcategories: {} },
    audiovisual: { color: "#D7ADBC", subcategories: { film: "#C98FA7", podcast: "#E4C4CF" } },
    study: { color: "#EAB668", subcategories: { english: "#D99A48", spanish: "#F1CC8E" } },
    body: { color: "#CCD48D", subcategories: { dance: "#B3C16A", strength: "#DCE2AE" } },
    flow: { color: "#8BAEB6", subcategories: { painting: "#6F9DA8", calligraphy: "#AAC6CC" } }
  };
  const DEFAULT_CATEGORIES = [
    { id: "reading", name: "阅读", color: "#8B86BE", subcategories: [] },
    { id: "audiovisual", name: "视听", color: "#D7ADBC", subcategories: [
      { id: "film", name: "影视", color: "#C98FA7" },
      { id: "podcast", name: "Podcast", color: "#E4C4CF" }
    ] },
    { id: "study", name: "学习", color: "#EAB668", subcategories: [
      { id: "english", name: "英语", color: "#D99A48" },
      { id: "spanish", name: "西语", color: "#F1CC8E" }
    ] },
    { id: "body", name: "Body", color: "#CCD48D", subcategories: [
      { id: "dance", name: "跳舞", color: "#B3C16A" },
      { id: "strength", name: "无氧", color: "#DCE2AE" }
    ] },
    { id: "flow", name: "Flow", color: "#8BAEB6", subcategories: [
      { id: "painting", name: "画画", color: "#6F9DA8" },
      { id: "calligraphy", name: "软笔", color: "#AAC6CC" }
    ] }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const refs = {
    weekView: $("#weekView"), monthView: $("#monthView"), analysisView: $("#analysisView"),
    weekScroll: $("#weekScroll"), weekGrid: $("#weekGrid"), monthGrid: $("#monthGrid"), monthFilters: $("#monthFilters"), analysisPeriodToggle: $("#analysisPeriodToggle"),
    analysisOverview: $("#analysisOverview"), categoryBreakdown: $("#categoryBreakdown"), dailyBreakdown: $("#dailyBreakdown"),
    pageTitle: $("#pageTitle"), periodTitle: $("#periodTitle"), periodSubtitle: $("#periodSubtitle"), entryCount: $("#entryCount"),
    prevButton: $("#prevButton"), nextButton: $("#nextButton"), todayButton: $("#todayButton"),
    entryDialog: $("#entryDialog"), entryDialogTitle: $("#entryDialogTitle"), entryDateLabel: $("#entryDateLabel"), entryId: $("#entryId"),
    entryCategory: $("#entryCategory"), entrySubcategory: $("#entrySubcategory"), subcategoryField: $("#subcategoryField"),
    entryTitle: $("#entryTitle"), entryDetail: $("#entryDetail"), entryDuration: $("#entryDuration"), colorOptions: $("#colorOptions"),
    deleteEntry: $("#deleteEntry"), saveEntry: $("#saveEntry"), categoriesDialog: $("#categoriesDialog"), categoryList: $("#categoryList"),
    dayDialog: $("#dayDialog"), dayDialogTitle: $("#dayDialogTitle"), dayDialogSubtitle: $("#dayDialogSubtitle"), dayEntryList: $("#dayEntryList"),
    addFromDay: $("#addFromDay"), toast: $("#toast")
  };
  const compactPhoneQuery = window.matchMedia("(max-width: 520px)");

  let state = loadState();
  let view = "week";
  let cursor = new Date();
  let activeDate = dateKey(new Date());
  let monthCategoryFilter = new Set(allMonthFilterTokens());
  let analysisPeriod = "month";
  let toastTimer;
  let firstRender = true;

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function mondayOf(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = result.getDay() || 7;
    result.setDate(result.getDate() - day + 1);
    return result;
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function collectUsedColors(categories = state.categories) {
    const colors = new Set();
    categories.forEach(category => {
      if (category.color) colors.add(category.color.toLowerCase());
      (category.subcategories || []).forEach(subcategory => {
        if (subcategory.color) colors.add(subcategory.color.toLowerCase());
      });
    });
    return colors;
  }

  function hexToHsl(hex) {
    const value = String(hex || "#777777").replace("#", "");
    const normalized = value.length === 3 ? value.split("").map(char => char + char).join("") : value.padEnd(6, "7").slice(0, 6);
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta) {
      s = delta / (1 - Math.abs(2 * l - 1));
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
    }
    return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const m = lightness - chroma / 2;
    let rgb = [0, 0, 0];
    if (h < 60) rgb = [chroma, x, 0];
    else if (h < 120) rgb = [x, chroma, 0];
    else if (h < 180) rgb = [0, chroma, x];
    else if (h < 240) rgb = [0, x, chroma];
    else if (h < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    return `#${rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function nextSubcategoryColor(baseColor, usedColors = collectUsedColors(), seed = 0) {
    const base = hexToHsl(baseColor);
    const hueOffsets = [14, -14, 25, -25, 36, -36, 8, -8, 48, -48];
    const lightOffsets = [13, 7, -7, 18, -12, 4];
    const saturationOffsets = [7, -5, 12, -9];
    for (let index = 0; index < 120; index++) {
      const step = index + seed;
      const hue = (base.h + hueOffsets[step % hueOffsets.length] + Math.floor(step / hueOffsets.length) * 3 + 360) % 360;
      const saturation = Math.max(34, Math.min(82, base.s + saturationOffsets[step % saturationOffsets.length]));
      const lightness = Math.max(30, Math.min(78, base.l + lightOffsets[step % lightOffsets.length]));
      const candidate = hslToHex(hue, saturation, lightness).toLowerCase();
      if (!usedColors.has(candidate)) return candidate;
    }
    return hslToHex((base.h + 17) % 360, base.s, Math.min(80, base.l + 10));
  }

  function normalizeSubcategoryColors(categories) {
    const used = new Set(categories.map(category => String(category.color || "").toLowerCase()).filter(Boolean));
    categories.forEach(category => {
      (category.subcategories || []).forEach((subcategory, index) => {
        const current = String(subcategory.color || "").toLowerCase();
        if (!current || used.has(current)) subcategory.color = nextSubcategoryColor(category.color, used, index);
        used.add(subcategory.color.toLowerCase());
      });
    });
  }

  function applyPaletteV5(categories) {
    const used = new Set();
    categories.forEach(category => {
      const palette = CATEGORY_PALETTE_V5[category.id];
      if (palette) category.color = palette.color;
      if (category.color) used.add(category.color.toLowerCase());
    });
    categories.forEach(category => {
      const palette = CATEGORY_PALETTE_V5[category.id];
      (category.subcategories || []).forEach((subcategory, index) => {
        const prescribed = palette?.subcategories?.[subcategory.id];
        if (prescribed && !used.has(prescribed.toLowerCase())) {
          subcategory.color = prescribed;
        } else {
          subcategory.color = nextSubcategoryColor(category.color, used, index);
        }
        used.add(subcategory.color.toLowerCase());
      });
    });
  }

  function demoState() {
    const monday = mondayOf(new Date());
    const samples = [
      [0, "reading", "", "百年孤独", "P. 120–156", 45],
      [0, "audiovisual", "podcast", "随机波动", "城市与记忆", 52],
      [1, "study", "english", "Daily English", "Shadowing", 25],
      [1, "flow", "calligraphy", "临帖", "兰亭序 · 2 页", 35],
      [2, "audiovisual", "film", "武林外传", "第 32 回", 46],
      [2, "body", "dance", "Dance practice", "Groove basics", 60],
      [3, "reading", "", "置身事内", "第二章", 55],
      [3, "study", "spanish", "Español", "Unidad 4", 30],
      [4, "audiovisual", "film", "Hacks", "S02E01", 29],
      [4, "body", "strength", "无氧训练", "上肢 + 核心", 40],
      [5, "flow", "painting", "水彩练习", "色彩小稿", 70],
      [5, "audiovisual", "podcast", "声东击西", "从纸张开始的生活", 48],
      [6, "reading", "", "文学回忆录", "木心 · 上册", 65],
      [6, "body", "dance", "Body flow", "Hip flow", 25]
    ];
    return {
      version: 5,
      categories: cloneDefaults(),
      records: samples.map((item, index) => ({
        id: `demo-${index}`,
        date: dateKey(addDays(monday, item[0])),
        categoryId: item[1],
        subcategoryId: item[2] || null,
        title: item[3],
        detail: item[4],
        durationMinutes: item[5],
        color: null
      }))
    };
  }

  function migrateState(saved) {
    if (Number(saved.version || 1) >= 3) {
      const savedVersion = Number(saved.version || 1);
      saved.categories.forEach(category => {
        if (!Array.isArray(category.subcategories)) category.subcategories = [];
      });
      saved.records.forEach(record => {
        if (!("subcategoryId" in record)) record.subcategoryId = null;
        record.durationMinutes = Math.max(0, Number(record.durationMinutes) || 0);
      });
      if (savedVersion < 5) applyPaletteV5(saved.categories);
      saved.version = 5;
      return saved;
    }

    const categories = cloneDefaults();
    const mapping = {
      reading: ["reading", null],
      tv: ["audiovisual", "film"],
      video: ["audiovisual", "film"],
      podcast: ["audiovisual", "podcast"],
      en: ["study", "english"],
      english: ["study", "english"],
      spanish: ["study", "spanish"],
      dance: ["body", "dance"],
      bodyflow: ["body", null],
      body: ["body", null],
      flow: ["flow", null],
      art: ["flow", "painting"],
      painting: ["flow", "painting"],
      calligraphy: ["flow", "calligraphy"]
    };
    const inferredDemoDurations = [45, 52, 40, 25, 46, 27, 55, 29, 13, 25, 118, 42, 48, 65, 20, 60, 25];
    const legacyById = new Map((saved.categories || []).map(category => [category.id, category]));
    let otherCategory = null;

    const records = (saved.records || []).map((record, index) => {
      const legacy = legacyById.get(record.categoryId);
      const key = String(record.categoryId || "").trim().toLowerCase();
      let target = mapping[key];
      if (!target && legacy) target = mapping[String(legacy.name || "").trim().toLowerCase()];
      if (!target) {
        if (!otherCategory) {
          otherCategory = { id: "other", name: "其他", color: "#777169", subcategories: [] };
          categories.push(otherCategory);
        }
        const legacyId = `legacy-${String(record.categoryId || "item").replace(/[^a-z0-9_-]/gi, "-")}`;
        if (!otherCategory.subcategories.some(item => item.id === legacyId)) {
          otherCategory.subcategories.push({ id: legacyId, name: legacy?.name || "旧分类", color: legacy?.color || otherCategory.color });
        }
        target = ["other", legacyId];
      }
      return {
        ...record,
        categoryId: target[0],
        subcategoryId: target[1],
        durationMinutes: Number(record.durationMinutes) || (String(record.id || "").startsWith("demo-") ? inferredDemoDurations[index] || 30 : 0)
      };
    });
    applyPaletteV5(categories);
    return { version: 5, categories, records };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.categories) && Array.isArray(saved.records)) {
        const migrated = migrateState(saved);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.warn("Unable to read saved journal", error);
    }
    const initial = demoState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  function persist(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    if (message) showToast(message);
  }

  function persistSilently() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function categoryById(id) {
    return state.categories.find(category => category.id === id);
  }

  function subcategoryById(category, id) {
    return category?.subcategories?.find(subcategory => subcategory.id === id);
  }

  function monthFilterToken(categoryId, subcategoryId = null) {
    return `${categoryId}:${subcategoryId || UNCATEGORIZED_TOKEN}`;
  }

  function categoryMonthTokens(category) {
    return [monthFilterToken(category.id), ...(category.subcategories || []).map(subcategory => monthFilterToken(category.id, subcategory.id))];
  }

  function allMonthFilterTokens() {
    return state.categories.flatMap(categoryMonthTokens);
  }

  function recordMatchesMonthFilter(record) {
    return monthCategoryFilter.has(monthFilterToken(record.categoryId, record.subcategoryId));
  }

  function recordColor(record) {
    const category = categoryById(record.categoryId);
    return record.color || subcategoryById(category, record.subcategoryId)?.color || category?.color || "#44413b";
  }

  function recordLabel(record) {
    const category = categoryById(record.categoryId);
    const subcategory = subcategoryById(category, record.subcategoryId);
    return subcategory ? `${category?.name || "分类"} · ${subcategory.name}` : category?.name || "分类";
  }

  function recordsOn(key) {
    return state.records.filter(record => record.date === key);
  }

  function monthRecords() {
    return state.records.filter(record => {
      const date = fromKey(record.date);
      return date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth();
    });
  }

  function analysisRange(offset = 0) {
    if (analysisPeriod === "week") {
      const start = mondayOf(addDays(cursor, offset * 7));
      return { start, end: addDays(start, 6) };
    }
    const start = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 0) };
  }

  function recordsInRange(range) {
    const start = dateKey(range.start);
    const end = dateKey(range.end);
    return state.records.filter(record => record.date >= start && record.date <= end);
  }

  function render() {
    document.body.dataset.currentView = view;
    refs.weekView.hidden = view !== "week";
    refs.monthView.hidden = view !== "month";
    refs.analysisView.hidden = view !== "analysis";
    refs.monthFilters.hidden = view !== "month";
    refs.analysisPeriodToggle.hidden = view !== "analysis";
    refs.pageTitle.textContent = view === "week" ? "这一周" : view === "month" ? "月度一览" : "时间复盘";
    $$('[data-view]').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (view === "week") renderWeek();
    if (view === "month") renderMonth();
    if (view === "analysis") renderAnalysis();
    refs.entryCount.textContent = toolbarSummary();
    if (firstRender && view === "week") {
      firstRender = false;
      requestAnimationFrame(() => { refs.weekScroll.scrollLeft = 0; });
    }
  }

  function visibleRecordCount() {
    if (view === "week") {
      const start = mondayOf(cursor);
      const end = addDays(start, 6);
      return state.records.filter(record => fromKey(record.date) >= start && fromKey(record.date) <= end).length;
    }
    return monthRecords().filter(record => view === "analysis" || recordMatchesMonthFilter(record)).length;
  }

  function toolbarSummary() {
    if (view === "analysis") {
      const total = recordsInRange(analysisRange()).reduce((sum, record) => sum + (Number(record.durationMinutes) || 0), 0);
      return `共 ${formatDuration(total)}`;
    }
    return `${visibleRecordCount()} 条记录`;
  }

  function applyWeekGridLayout() {
    const categoryCount = state.categories.length;
    const compactPhone = compactPhoneQuery.matches;
    const containerWidth = refs.weekScroll.clientWidth || window.innerWidth;
    let dateColumnWidth = compactPhone ? 40 : 64;
    if (categoryCount >= 7) dateColumnWidth = compactPhone ? 34 : 56;
    if (categoryCount >= 9) dateColumnWidth = compactPhone ? 30 : 48;
    const categoryColumnWidth = categoryCount
      ? Math.max(0, containerWidth - dateColumnWidth) / categoryCount
      : containerWidth;
    const dense = categoryColumnWidth < (compactPhone ? 58 : 86);
    const ultraDense = categoryColumnWidth < (compactPhone ? 42 : 58);

    refs.weekGrid.classList.toggle("is-dense", dense);
    refs.weekGrid.classList.toggle("is-ultra-dense", ultraDense);
    refs.weekGrid.dataset.categoryCount = String(categoryCount);
    refs.weekGrid.style.gridTemplateColumns = categoryCount
      ? `${dateColumnWidth}px repeat(${categoryCount}, minmax(0, 1fr))`
      : "minmax(0, 1fr)";
    refs.weekGrid.style.minWidth = "0";
    refs.weekGrid.style.width = "100%";
  }

  function renderWeek() {
    const start = mondayOf(cursor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    refs.periodTitle.textContent = sameMonth
      ? `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()}–${end.getDate()} 日`
      : `${start.getMonth() + 1} 月 ${start.getDate()} 日 – ${end.getMonth() + 1} 月 ${end.getDate()} 日`;
    refs.periodSubtitle.textContent = `第 ${weekNumber(start)} 周 · ${state.categories.length} 个分类`;
    const compactPhone = compactPhoneQuery.matches;
    applyWeekGridLayout();

    let html = `<div class="grid-cell week-head date-heading"><strong>DATE</strong><span>weekly log</span></div>`;
    state.categories.forEach(category => {
      html += `<div class="grid-cell week-head category-heading"><i class="category-dot" style="background:${category.color}"></i><strong>${escapeHtml(category.name)}</strong></div>`;
    });
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const date = addDays(start, dayIndex);
      const key = dateKey(date);
      const today = key === dateKey(new Date());
      html += `<div class="grid-cell date-cell${today ? " today" : ""}${dayIndex === 6 ? " last-row" : ""}"><span class="weekday">${WEEKDAYS[dayIndex]}</span><strong class="day-number">${date.getDate()}</strong><span class="month-mini">${date.getMonth() + 1}月</span></div>`;
      state.categories.forEach(category => {
        const cellRecords = state.records.filter(record => record.date === key && record.categoryId === category.id);
        const visibleCellRecords = compactPhone ? cellRecords.slice(0, 3) : cellRecords;
        html += `<div class="grid-cell journal-cell${dayIndex === 6 ? " last-row" : ""}" tabindex="0" role="button" aria-label="${date.getMonth() + 1}月${date.getDate()}日 ${escapeHtml(category.name)}，添加记录" data-date="${key}" data-category="${escapeHtml(category.id)}">`;
        visibleCellRecords.forEach(record => {
          const subcategory = subcategoryById(category, record.subcategoryId);
          html += `<button class="entry-card" type="button" data-entry="${escapeHtml(record.id)}" style="color:${recordColor(record)}"><strong>${escapeHtml(record.title)}</strong>${record.detail ? `<small>${escapeHtml(record.detail)}</small>` : ""}${subcategory ? `<small>${escapeHtml(subcategory.name)}</small>` : ""}</button>`;
        });
        if (visibleCellRecords.length < cellRecords.length) html += `<span class="entry-overflow">＋${cellRecords.length - visibleCellRecords.length}</span>`;
        html += `</div>`;
      });
    }
    refs.weekGrid.innerHTML = html;
    $$('.journal-cell', refs.weekGrid).forEach(cell => {
      cell.addEventListener("click", event => { if (!event.target.closest(".entry-card")) openAdd(cell.dataset.date, cell.dataset.category); });
      cell.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openAdd(cell.dataset.date, cell.dataset.category);
        }
      });
    });
    $$('[data-entry]', refs.weekGrid).forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      openEdit(button.dataset.entry);
    }));
  }

  function renderMonth() {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    refs.periodTitle.textContent = `${y} 年 ${m + 1} 月`;
    refs.periodSubtitle.textContent = "";
    renderMonthFilters();
    const gridStart = mondayOf(new Date(y, m, 1));
    let html = "";
    for (let index = 0; index < 42; index++) {
      const date = addDays(gridStart, index);
      const key = dateKey(date);
      const dayRecords = recordsOn(key).filter(recordMatchesMonthFilter);
      const outside = date.getMonth() !== m;
      const today = key === dateKey(new Date());
      html += `<button class="month-day${outside ? " outside" : ""}${today ? " today" : ""}" type="button" data-day="${key}">`;
      html += `<span class="month-day-number"><span>${date.getDate()}</span>${date.getDate() === 1 ? `<em>${date.getMonth() + 1}月</em>` : ""}</span><span class="month-summary">`;
      dayRecords.slice(0, 3).forEach(record => {
        html += `<span class="month-entry"><i style="background:${recordColor(record)}"></i><span>${escapeHtml(record.title)}</span></span>`;
      });
      if (dayRecords.length > 3) html += `<span class="more-count">＋${dayRecords.length - 3} 条</span>`;
      html += `</span></button>`;
    }
    refs.monthGrid.innerHTML = html;
    $$('[data-day]', refs.monthGrid).forEach(button => button.addEventListener("click", () => openDay(button.dataset.day)));
  }

  function renderMonthFilters() {
    const allTokens = allMonthFilterTokens();
    const allSelected = allTokens.length > 0 && allTokens.every(token => monthCategoryFilter.has(token));
    refs.monthFilters.innerHTML = `<span class="filter-prefix">显示</span><button class="filter-chip all${allSelected ? " active" : ""}" type="button" data-month-filter="all" aria-pressed="${allSelected}"><i></i>全部</button>` + state.categories.map(category => {
      const categoryTokens = categoryMonthTokens(category);
      const categoryActive = categoryTokens.every(token => monthCategoryFilter.has(token));
      const children = (category.subcategories || []).map(subcategory => {
        const token = monthFilterToken(category.id, subcategory.id);
        const active = monthCategoryFilter.has(token);
        return `<button class="filter-chip child-chip${active ? " active" : ""}" type="button" data-month-filter="child:${escapeHtml(category.id)}:${escapeHtml(subcategory.id)}" aria-pressed="${active}" style="--chip-color:${subcategory.color}"><i></i>${escapeHtml(subcategory.name)}<b>✓</b></button>`;
      }).join("");
      return `<span class="filter-group"><button class="filter-chip parent-chip${categoryActive ? " active" : ""}" type="button" data-month-filter="category:${escapeHtml(category.id)}" aria-pressed="${categoryActive}" style="--chip-color:${category.color}"><i></i>${escapeHtml(category.name)}<b>✓</b></button>${children ? `<span class="child-filter-list">${children}</span>` : ""}</span>`;
    }).join("");
    $$('[data-month-filter]', refs.monthFilters).forEach(button => button.addEventListener("click", () => {
      const value = button.dataset.monthFilter;
      if (value === "all") {
        monthCategoryFilter = allSelected ? new Set() : new Set(allTokens);
      } else if (value.startsWith("category:")) {
        const category = categoryById(value.slice("category:".length));
        if (!category) return;
        const tokens = categoryMonthTokens(category);
        if (allSelected) monthCategoryFilter = new Set(tokens);
        else if (tokens.every(token => monthCategoryFilter.has(token))) tokens.forEach(token => monthCategoryFilter.delete(token));
        else tokens.forEach(token => monthCategoryFilter.add(token));
      } else if (value.startsWith("child:")) {
        const [categoryId, subcategoryId] = value.slice("child:".length).split(":");
        const token = monthFilterToken(categoryId, subcategoryId);
        if (allSelected) monthCategoryFilter = new Set([token]);
        else if (monthCategoryFilter.has(token)) monthCategoryFilter.delete(token);
        else monthCategoryFilter.add(token);
      }
      renderMonth();
      refs.entryCount.textContent = toolbarSummary();
    }));
  }

  function renderAnalysis() {
    const currentRange = analysisRange();
    const previousRange = analysisRange(-1);
    const records = recordsInRange(currentRange).filter(record => Number(record.durationMinutes) > 0);
    const previousRecords = recordsInRange(previousRange).filter(record => Number(record.durationMinutes) > 0);
    const total = records.reduce((sum, record) => sum + Number(record.durationMinutes), 0);
    const previousTotal = previousRecords.reduce((sum, record) => sum + Number(record.durationMinutes), 0);
    const periodWord = analysisPeriod === "week" ? "本周" : "本月";
    refs.periodTitle.textContent = formatAnalysisRange(currentRange);
    refs.periodSubtitle.textContent = `${analysisPeriod === "week" ? "周" : "月"}分析 · 与${analysisPeriod === "week" ? "上周" : "上月"}对比`;
    $$('[data-analysis-period]', refs.analysisPeriodToggle).forEach(button => {
      const active = button.dataset.analysisPeriod === analysisPeriod;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const categoryTotals = state.categories.map(category => ({
      category,
      total: totalFor(records, category.id),
      previousTotal: totalFor(previousRecords, category.id)
    })).filter(item => item.total > 0 || item.previousTotal > 0);
    const currentCategoryTotals = categoryTotals.filter(item => item.total > 0);
    const gradient = total
      ? currentCategoryTotals.reduce((result, item, index) => {
        const before = currentCategoryTotals.slice(0, index).reduce((sum, part) => sum + part.total, 0) / total * 100;
        const after = before + item.total / total * 100;
        return `${result}${index ? "," : ""}${item.category.color} ${before}% ${after}%`;
      }, "")
      : `var(--paper-deep) 0 100%`;
    const topCategory = [...categoryTotals].sort((a, b) => b.total - a.total)[0];
    refs.analysisOverview.innerHTML = `
      <section class="analysis-total"><div class="time-ring" style="background:conic-gradient(${gradient})"></div><div class="analysis-total-copy"><strong>${formatDuration(total)}</strong><span>${periodWord}已记录时长</span><p>${total ? `投入最多的是 ${escapeHtml(topCategory?.category.name || "—")} · ${formatPercent(topCategory?.total || 0, total)}` : "为记录填写时长后，这里会出现你的时间图谱。"}</p>${comparisonMarkup(total, previousTotal)}</div></section>`;

    if (!records.length && !previousRecords.length) {
      refs.categoryBreakdown.innerHTML = `<div class="analysis-empty"><strong>还没有时长数据</strong><span>新增或编辑记录，填写投入分钟数即可开始分析。</span></div>`;
      refs.dailyBreakdown.innerHTML = `<div class="analysis-empty" style="grid-column:1/-1"><strong>等待第一笔记录</strong><span>时长不会显示在周记或月历中。</span></div>`;
      return;
    }

    refs.categoryBreakdown.innerHTML = categoryTotals.sort((a, b) => b.total - a.total).map(item => {
      const childTotals = item.category.subcategories.map(subcategory => ({
        name: subcategory.name,
        color: subcategory.color,
        total: totalFor(records, item.category.id, subcategory.id),
        previousTotal: totalFor(previousRecords, item.category.id, subcategory.id)
      }));
      const uncategorized = {
        name: "未分子类别",
        color: item.category.color,
        total: totalFor(records, item.category.id, null),
        previousTotal: totalFor(previousRecords, item.category.id, null)
      };
      if (uncategorized.total > 0 || uncategorized.previousTotal > 0) childTotals.push(uncategorized);
      const usedChildren = childTotals.filter(part => part.total > 0 || part.previousTotal > 0);
      const children = usedChildren.length ? `<div class="subcategory-totals">${usedChildren.map(part => `<div class="subcategory-analysis-row"><span class="subcategory-label"><i style="--sub-color:${part.color}"></i>${escapeHtml(part.name)}</span><em class="subcategory-share">${formatPercent(part.total, total)}</em><strong class="subcategory-time">${formatDuration(part.total)}</strong>${comparisonMarkup(part.total, part.previousTotal)}</div>`).join("")}</div>` : `<div class="subcategory-empty">本期和上一期均无子类别时长</div>`;
      const barWidth = item.total && total ? Math.max(2, item.total / total * 100) : 0;
      return `<div class="breakdown-row" style="--row-color:${item.category.color};--bar-width:${barWidth}%"><div class="breakdown-heading"><span class="breakdown-category"><i></i><strong>${escapeHtml(item.category.name)}</strong></span><span class="breakdown-share">${formatPercent(item.total, total)}</span><span class="breakdown-time">${formatDuration(item.total)}</span><span class="breakdown-comparison">${comparisonMarkup(item.total, item.previousTotal)}</span></div><div class="time-track"><i></i></div>${children}</div>`;
    }).join("");

    const weekdayTotals = analysisPeriod === "week"
      ? WEEKDAYS.map((label, index) => {
        const key = dateKey(addDays(currentRange.start, index));
        return { label: label.replace("周", ""), total: records.filter(record => record.date === key).reduce((sum, record) => sum + Number(record.durationMinutes), 0) };
      })
      : WEEKDAYS.map((label, index) => ({
        label: label.replace("周", ""),
        total: records.filter(record => ((fromKey(record.date).getDay() + 6) % 7) === index).reduce((sum, record) => sum + Number(record.durationMinutes), 0)
      }));
    const maxDay = Math.max(...weekdayTotals.map(day => day.total), 1);
    refs.dailyBreakdown.innerHTML = weekdayTotals.map(day => `<div class="day-bar"><strong>${day.total ? formatDuration(day.total) : "—"}</strong><i style="--day-height:${Math.max(3, day.total / maxDay * 100)}%;--bar-color:var(--accent)"></i><span>${day.label}</span></div>`).join("");
  }

  function totalFor(records, categoryId, subcategoryId = undefined) {
    return records.filter(record => record.categoryId === categoryId && (subcategoryId === undefined || (subcategoryId === null ? !record.subcategoryId : record.subcategoryId === subcategoryId))).reduce((sum, record) => sum + Number(record.durationMinutes), 0);
  }

  function formatPercent(value, total) {
    if (!total || !value) return "0%";
    return `${(value / total * 100).toFixed(1).replace(".0", "")}%`;
  }

  function formatAnalysisRange(range) {
    if (analysisPeriod === "month") return `${range.start.getFullYear()} 年 ${range.start.getMonth() + 1} 月`;
    const sameMonth = range.start.getMonth() === range.end.getMonth();
    return sameMonth
      ? `${range.start.getFullYear()} 年 ${range.start.getMonth() + 1} 月 ${range.start.getDate()}–${range.end.getDate()} 日`
      : `${range.start.getFullYear()} 年 ${range.start.getMonth() + 1} 月 ${range.start.getDate()} 日 – ${range.end.getMonth() + 1} 月 ${range.end.getDate()} 日`;
  }

  function comparisonMarkup(current, previous) {
    const currentValue = Number(current) || 0;
    const previousValue = Number(previous) || 0;
    const delta = currentValue - previousValue;
    const previousLabel = analysisPeriod === "week" ? "上周" : "上月";
    if (!delta) return `<span class="trend trend-flat" aria-label="与${previousLabel}持平">0%</span>`;
    const percentage = previousValue > 0 ? Math.abs(delta) / previousValue * 100 : 100;
    const formatted = `${percentage.toFixed(1).replace(".0", "")}%`;
    const direction = delta > 0 ? "增加" : "减少";
    return `<span class="trend ${delta > 0 ? "trend-up" : "trend-down"}" aria-label="较${previousLabel}${direction} ${formatted}">${delta > 0 ? formatted : `-${formatted}`}</span>`;
  }

  function weekNumber(date) {
    const target = new Date(date.valueOf());
    const day = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - day + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    return 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  }

  function formatFullDate(key) {
    const date = fromKey(key);
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${WEEKDAYS[(date.getDay() + 6) % 7]}`;
  }

  function formatDuration(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (value < 60) return `${value} 分钟`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }

  function fillCategorySelect(selectedId) {
    refs.entryCategory.innerHTML = state.categories.map(category => `<option value="${escapeHtml(category.id)}"${category.id === selectedId ? " selected" : ""}>${escapeHtml(category.name)}</option>`).join("");
  }

  function fillSubcategorySelect(categoryId, selectedId) {
    const category = categoryById(categoryId);
    const children = category?.subcategories || [];
    refs.entrySubcategory.innerHTML = `<option value="">不选择子类别</option>` + children.map(subcategory => `<option value="${escapeHtml(subcategory.id)}"${subcategory.id === selectedId ? " selected" : ""}>${escapeHtml(subcategory.name)}</option>`).join("");
    refs.entrySubcategory.disabled = children.length === 0;
    refs.subcategoryField.hidden = children.length === 0;
  }

  function renderColorOptions(selected) {
    refs.colorOptions.innerHTML = `<label class="color-choice inherit"><input type="radio" name="entryColor" value="inherit" ${!selected ? "checked" : ""}><span>跟随分类 / 子类别</span></label>` + COLORS.map(color => `<label class="color-choice"><input type="radio" name="entryColor" value="${color}" ${selected === color ? "checked" : ""}><span style="--choice:${color}" aria-label="${color}"></span></label>`).join("");
  }

  function openAdd(key, categoryId = state.categories[0]?.id) {
    if (!state.categories.length) {
      showToast("请先添加一个分类");
      openCategorySettings();
      return;
    }
    activeDate = key;
    refs.entryDialogTitle.textContent = "添加记录";
    refs.entryDateLabel.textContent = formatFullDate(key);
    refs.entryId.value = "";
    fillCategorySelect(categoryId || state.categories[0].id);
    fillSubcategorySelect(refs.entryCategory.value, null);
    refs.entryTitle.value = "";
    refs.entryDetail.value = "";
    refs.entryDuration.value = "";
    refs.deleteEntry.hidden = true;
    renderColorOptions(null);
    refs.entryDialog.showModal();
    requestAnimationFrame(() => refs.entryTitle.focus());
  }

  function openEdit(id) {
    const record = state.records.find(item => item.id === id);
    if (!record) return;
    activeDate = record.date;
    refs.entryDialogTitle.textContent = "编辑记录";
    refs.entryDateLabel.textContent = formatFullDate(record.date);
    refs.entryId.value = record.id;
    fillCategorySelect(record.categoryId);
    fillSubcategorySelect(record.categoryId, record.subcategoryId);
    refs.entryTitle.value = record.title;
    refs.entryDetail.value = record.detail || "";
    refs.entryDuration.value = Number(record.durationMinutes) || "";
    refs.deleteEntry.hidden = false;
    renderColorOptions(record.color);
    refs.entryDialog.showModal();
  }

  function saveEntry() {
    const title = refs.entryTitle.value.trim();
    if (!title) {
      refs.entryTitle.focus();
      showToast("请写一个简短标题");
      return;
    }
    const colorValue = $('input[name="entryColor"]:checked')?.value;
    const data = {
      date: activeDate,
      categoryId: refs.entryCategory.value,
      subcategoryId: refs.entrySubcategory.disabled ? null : refs.entrySubcategory.value || null,
      title,
      detail: refs.entryDetail.value.trim(),
      durationMinutes: Math.max(0, Math.min(1440, Number(refs.entryDuration.value) || 0)),
      color: colorValue && colorValue !== "inherit" ? colorValue : null
    };
    const existing = state.records.find(record => record.id === refs.entryId.value);
    if (existing) Object.assign(existing, data);
    else state.records.push({ id: uid("entry"), ...data });
    refs.entryDialog.close();
    persist(existing ? "记录已更新" : "记录已添加");
  }

  function deleteEntry() {
    const id = refs.entryId.value;
    if (!id) return;
    state.records = state.records.filter(record => record.id !== id);
    refs.entryDialog.close();
    persist("记录已删除");
  }

  function openDay(key) {
    activeDate = key;
    const records = recordsOn(key).filter(recordMatchesMonthFilter);
    const date = fromKey(key);
    refs.dayDialogTitle.textContent = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
    refs.dayDialogSubtitle.textContent = `${WEEKDAYS[(date.getDay() + 6) % 7]} · ${records.length} 条记录`;
    refs.dayEntryList.innerHTML = records.length ? records.map(record => `<button class="day-entry-row" type="button" data-day-entry="${escapeHtml(record.id)}" style="--entry-color:${recordColor(record)}"><small>${escapeHtml(recordLabel(record))}</small><strong>${escapeHtml(record.title)}</strong>${record.detail ? `<p>${escapeHtml(record.detail)}</p>` : ""}</button>`).join("") : `<div class="empty-day">这一天还没有记录</div>`;
    $$('[data-day-entry]', refs.dayEntryList).forEach(button => button.addEventListener("click", () => {
      refs.dayDialog.close();
      openEdit(button.dataset.dayEntry);
    }));
    refs.dayDialog.showModal();
  }

  function openCategorySettings() {
    renderCategorySettings();
    refs.categoriesDialog.showModal();
  }

  function renderCategorySettings() {
    refs.categoryList.innerHTML = state.categories.map((category, index) => `
      <section class="category-card" data-category-card="${escapeHtml(category.id)}">
        <div class="category-row">
          <span class="drag-mark">⋮⋮</span>
          <input class="category-color" type="color" value="${category.color}" data-category-color="${escapeHtml(category.id)}" aria-label="${escapeHtml(category.name)}颜色">
          <input class="category-name" value="${escapeHtml(category.name)}" maxlength="20" data-category-name="${escapeHtml(category.id)}" aria-label="分类名称">
          <div class="category-actions">
            <button class="mini-button" type="button" data-move-category="up" data-id="${escapeHtml(category.id)}" ${index === 0 ? "disabled" : ""} aria-label="上移">↑</button>
            <button class="mini-button" type="button" data-move-category="down" data-id="${escapeHtml(category.id)}" ${index === state.categories.length - 1 ? "disabled" : ""} aria-label="下移">↓</button>
            <button class="mini-button delete" type="button" data-delete-category="${escapeHtml(category.id)}" aria-label="删除">×</button>
          </div>
        </div>
        <div class="subcategory-block">
          <div class="subcategory-caption">子类别与颜色</div>
          <div class="subcategory-list">${category.subcategories.map(subcategory => `
            <div class="subcategory-row">
              <input class="subcategory-color" type="color" value="${subcategory.color}" data-subcategory-color="${escapeHtml(category.id)}:${escapeHtml(subcategory.id)}" aria-label="${escapeHtml(subcategory.name)}颜色">
              <input class="subcategory-name" value="${escapeHtml(subcategory.name)}" maxlength="20" data-subcategory-name="${escapeHtml(category.id)}:${escapeHtml(subcategory.id)}" aria-label="子类别名称">
              <button class="mini-button delete" type="button" data-delete-subcategory="${escapeHtml(category.id)}:${escapeHtml(subcategory.id)}" aria-label="删除子类别">×</button>
            </div>`).join("")}</div>
          <button class="add-subcategory" type="button" data-add-subcategory="${escapeHtml(category.id)}">＋ 添加子类别</button>
        </div>
      </section>`).join("");

    $$('[data-category-name]', refs.categoryList).forEach(input => input.addEventListener("input", () => {
      const category = categoryById(input.dataset.categoryName);
      if (category) { category.name = input.value; persistSilently(); }
    }));
    $$('[data-category-color]', refs.categoryList).forEach(input => input.addEventListener("input", () => {
      const category = categoryById(input.dataset.categoryColor);
      if (category) { category.color = input.value; persistSilently(); }
    }));
    $$('[data-subcategory-name]', refs.categoryList).forEach(input => input.addEventListener("input", () => updateSubcategory(input.dataset.subcategoryName, "name", input.value)));
    $$('[data-subcategory-color]', refs.categoryList).forEach(input => input.addEventListener("input", () => updateSubcategory(input.dataset.subcategoryColor, "color", input.value)));
    $$('[data-move-category]', refs.categoryList).forEach(button => button.addEventListener("click", () => moveCategory(button.dataset.id, button.dataset.moveCategory)));
    $$('[data-delete-category]', refs.categoryList).forEach(button => button.addEventListener("click", () => removeCategory(button.dataset.deleteCategory)));
    $$('[data-add-subcategory]', refs.categoryList).forEach(button => button.addEventListener("click", () => addSubcategory(button.dataset.addSubcategory)));
    $$('[data-delete-subcategory]', refs.categoryList).forEach(button => button.addEventListener("click", () => removeSubcategory(button.dataset.deleteSubcategory)));
  }

  function updateSubcategory(compoundId, field, value) {
    const [categoryId, subcategoryId] = compoundId.split(":");
    const subcategory = subcategoryById(categoryById(categoryId), subcategoryId);
    if (subcategory) { subcategory[field] = value; persistSilently(); }
  }

  function addCategory() {
    const category = { id: uid("category"), name: "新分类", color: COLORS[state.categories.length % COLORS.length], subcategories: [] };
    state.categories.push(category);
    monthCategoryFilter.add(monthFilterToken(category.id));
    persistSilently();
    renderCategorySettings();
    requestAnimationFrame(() => {
      const input = refs.categoryList.querySelector(`[data-category-name="${CSS.escape(category.id)}"]`);
      input?.focus();
      input?.select();
    });
  }

  function addSubcategory(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
    const parentWasSelected = categoryMonthTokens(category).every(token => monthCategoryFilter.has(token));
    const subcategory = {
      id: uid("subcategory"),
      name: "新子类别",
      color: nextSubcategoryColor(category.color, collectUsedColors(), category.subcategories.length)
    };
    category.subcategories.push(subcategory);
    if (parentWasSelected) monthCategoryFilter.add(monthFilterToken(category.id, subcategory.id));
    persistSilently();
    renderCategorySettings();
    requestAnimationFrame(() => {
      const input = refs.categoryList.querySelector(`[data-subcategory-name="${CSS.escape(category.id)}:${CSS.escape(subcategory.id)}"]`);
      input?.focus();
      input?.select();
    });
  }

  function moveCategory(id, direction) {
    const index = state.categories.findIndex(category => category.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= state.categories.length) return;
    [state.categories[index], state.categories[target]] = [state.categories[target], state.categories[index]];
    persistSilently();
    renderCategorySettings();
  }

  function removeCategory(id) {
    const category = categoryById(id);
    if (!category) return;
    const recordCount = state.records.filter(record => record.categoryId === id).length;
    const warning = recordCount ? `删除“${category.name}”也会删除其中 ${recordCount} 条记录。确定继续吗？` : `确定删除“${category.name}”吗？`;
    if (!window.confirm(warning)) return;
    categoryMonthTokens(category).forEach(token => monthCategoryFilter.delete(token));
    state.categories = state.categories.filter(item => item.id !== id);
    state.records = state.records.filter(record => record.categoryId !== id);
    persistSilently();
    renderCategorySettings();
  }

  function removeSubcategory(compoundId) {
    const [categoryId, subcategoryId] = compoundId.split(":");
    const category = categoryById(categoryId);
    const subcategory = subcategoryById(category, subcategoryId);
    if (!category || !subcategory) return;
    if (!window.confirm(`确定删除子类别“${subcategory.name}”吗？已有记录会保留在“${category.name}”中。`)) return;
    const removedToken = monthFilterToken(categoryId, subcategoryId);
    const wasSelected = monthCategoryFilter.has(removedToken);
    monthCategoryFilter.delete(removedToken);
    category.subcategories = category.subcategories.filter(item => item.id !== subcategoryId);
    state.records.forEach(record => {
      if (record.categoryId === categoryId && record.subcategoryId === subcategoryId) record.subcategoryId = null;
    });
    if (wasSelected) monthCategoryFilter.add(monthFilterToken(categoryId));
    persistSilently();
    renderCategorySettings();
  }

  function changePeriod(amount) {
    if (view === "week" || (view === "analysis" && analysisPeriod === "week")) cursor = addDays(cursor, amount * 7);
    else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1);
    render();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add("show");
    toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2200);
  }

  $$('[data-view]').forEach(button => button.addEventListener("click", () => {
    view = button.dataset.view;
    render();
    window.scrollTo(0, 0);
  }));
  $$('[data-analysis-period]', refs.analysisPeriodToggle).forEach(button => button.addEventListener("click", () => {
    analysisPeriod = button.dataset.analysisPeriod;
    render();
  }));
  refs.prevButton.addEventListener("click", () => changePeriod(-1));
  refs.nextButton.addEventListener("click", () => changePeriod(1));
  refs.todayButton.addEventListener("click", () => { cursor = new Date(); render(); });
  refs.entryCategory.addEventListener("change", () => fillSubcategorySelect(refs.entryCategory.value, null));
  refs.saveEntry.addEventListener("click", saveEntry);
  refs.deleteEntry.addEventListener("click", deleteEntry);
  $("#openCategories").addEventListener("click", openCategorySettings);
  $("#addCategory").addEventListener("click", addCategory);
  $("#mobileAdd").addEventListener("click", () => openAdd(dateKey(new Date())));
  refs.addFromDay.addEventListener("click", () => {
    refs.dayDialog.close();
    openAdd(activeDate);
  });
  $("#resetDemo").addEventListener("click", () => {
    if (!window.confirm("恢复示例数据会覆盖当前所有本地记录，确定继续吗？")) return;
    state = demoState();
    monthCategoryFilter = new Set(allMonthFilterTokens());
    refs.categoriesDialog.close();
    persist("已恢复示例数据");
  });
  refs.categoriesDialog.addEventListener("close", () => {
    state.categories.forEach(category => {
      category.name = category.name.trim() || "未命名分类";
      category.subcategories.forEach(subcategory => { subcategory.name = subcategory.name.trim() || "未命名子类别"; });
    });
    persist();
  });
  refs.entryDialog.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveEntry();
  });
  window.addEventListener("load", () => requestAnimationFrame(() => {
    if (view === "week") refs.weekScroll.scrollLeft = 0;
  }), { once: true });
  const handlePhoneLayoutChange = () => {
    if (view === "week") renderWeek();
  };
  if (compactPhoneQuery.addEventListener) compactPhoneQuery.addEventListener("change", handlePhoneLayoutChange);
  else compactPhoneQuery.addListener(handlePhoneLayoutChange);
  if ("ResizeObserver" in window) {
    const weekGridResizeObserver = new ResizeObserver(() => {
      if (view === "week") applyWeekGridLayout();
    });
    weekGridResizeObserver.observe(refs.weekScroll);
  } else {
    window.addEventListener("resize", () => {
      if (view === "week") applyWeekGridLayout();
    });
  }

  render();
})();
