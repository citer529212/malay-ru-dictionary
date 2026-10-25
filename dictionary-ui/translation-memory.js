import { parseImportedMemory, rankSegments, sanitizeSegment, toTmx } from "./translation-memory-core.js";

const STORAGE_KEY = "dictionary-shell:translation-memory:v1";
const $ = (id) => document.getElementById(id);
const ui = {
  tabs: [...document.querySelectorAll("[data-product-tab]")], dictionaryPanel: $("dictionaryPanel"), memoryPanel: $("memoryPanel"),
  count: $("tmCount"), domainFilter: $("tmDomainFilter"), search: $("tmSearch"), source: $("tmSource"), target: $("tmTarget"),
  domain: $("tmDomain"), status: $("tmStatus"), save: $("tmSave"), clear: $("tmClear"), importFile: $("tmImportFile"),
  exportJson: $("tmExportJson"), exportTmx: $("tmExportTmx"), statusText: $("tmStatusText"), suggestions: $("tmSuggestions"), list: $("tmList"),
};
let segments = load();

function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(sanitizeSegment).filter(Boolean); } catch { return []; } }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(segments)); }
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }
function domainLabel(value) { return { politics: "Политика", culture: "Культура", religion: "Религия", military: "Военная тематика" }[value] || value; }
function statusLabel(value) { return { machine: "Машинный", reviewed: "Проверено", verified: "Подтверждено" }[value] || value; }

function render() {
  ui.count.textContent = `${segments.length} сегментов`;
  const filtered = segments.filter((row) => ui.domainFilter.value === "all" || row.domain === ui.domainFilter.value).slice().reverse();
  ui.list.innerHTML = filtered.length ? filtered.slice(0, 100).map((row) => `<article class="tm-card"><div class="tm-card-meta"><span>${domainLabel(row.domain)}</span><span class="tm-status-${row.status}">${statusLabel(row.status)}</span></div><p lang="ru">${escapeHtml(row.source)}</p><p lang="ms">${escapeHtml(row.target)}</p></article>`).join("") : '<p class="tm-empty">Память пока пуста. Добавьте сегмент или импортируйте корпус.</p>';
  renderSuggestions();
}

function renderSuggestions() {
  const matches = rankSegments(ui.search.value, segments, ui.domainFilter.value).slice(0, 12);
  ui.suggestions.innerHTML = matches.map((row) => `<button type="button" class="tm-match" data-tm-id="${escapeHtml(row.id)}"><strong>${row.score}%</strong><span>${escapeHtml(row.source)}</span><span>${escapeHtml(row.target)}</span><small>${domainLabel(row.domain)} · ${statusLabel(row.status)}</small></button>`).join("");
}

function saveSegment() {
  const row = sanitizeSegment({ source: ui.source.value, target: ui.target.value, domain: ui.domain.value, status: ui.status.value, author: "Чернобаев Б.Д." });
  if (!row) { ui.statusText.textContent = "Заполните оригинал и перевод."; return; }
  const duplicate = segments.findIndex((item) => item.source.toLowerCase() === row.source.toLowerCase() && item.target.toLowerCase() === row.target.toLowerCase());
  if (duplicate >= 0) segments[duplicate] = { ...segments[duplicate], ...row, id: segments[duplicate].id };
  else segments.push(row);
  persist(); clearEditor(); ui.statusText.textContent = `Сегмент сохранён локально со статусом «${statusLabel(row.status)}».`; render();
}

function clearEditor() { ui.source.value = ""; ui.target.value = ""; }
function download(content, name, type) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }

ui.tabs.forEach((button) => button.addEventListener("click", () => {
  const memory = button.dataset.productTab === "memory";
  ui.dictionaryPanel.hidden = memory; ui.memoryPanel.hidden = !memory;
  ui.tabs.forEach((tab) => tab.classList.toggle("active", tab === button));
}));
ui.save.addEventListener("click", saveSegment);
ui.clear.addEventListener("click", clearEditor);
ui.search.addEventListener("input", renderSuggestions);
ui.domainFilter.addEventListener("change", render);
ui.suggestions.addEventListener("click", (event) => { const button = event.target.closest("[data-tm-id]"); const row = segments.find((item) => item.id === button?.dataset.tmId); if (row) { ui.source.value = row.source; ui.target.value = row.target; ui.domain.value = row.domain; ui.status.value = row.status; } });
ui.importFile.addEventListener("change", async () => {
  const file = ui.importFile.files?.[0]; if (!file) return;
  try { const imported = parseImportedMemory(await file.text(), file.name.toLowerCase().endsWith(".csv") ? "csv" : "json"); segments.push(...imported.map((row) => ({ ...row, status: row.status || "machine" }))); persist(); ui.statusText.textContent = `Импортировано сегментов: ${imported.length}. Машинные переводы требуют проверки.`; render(); }
  catch (error) { ui.statusText.textContent = `Импорт не выполнен: ${error.message}`; }
  ui.importFile.value = "";
});
ui.exportJson.addEventListener("click", () => download(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), segments }, null, 2), "translation-memory.json", "application/json"));
ui.exportTmx.addEventListener("click", () => download(toTmx(segments), "translation-memory.tmx", "application/xml"));
render();
