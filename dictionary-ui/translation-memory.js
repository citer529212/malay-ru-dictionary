import { memoryStats, mergeSegments, parseImportedMemory, rankSegments, sanitizeSegment, toCsv, toTmx } from "./translation-memory-core.js";

const STORAGE_KEY = "dictionary-shell:translation-memory:v1";
const $ = (id) => document.getElementById(id);
const ui = {
  tabs: [...document.querySelectorAll("[data-product-tab]")], dictionaryPanel: $("dictionaryPanel"), memoryPanel: $("memoryPanel"),
  count: $("tmCount"), domainFilter: $("tmDomainFilter"), statusFilter: $("tmStatusFilter"), search: $("tmSearch"), source: $("tmSource"), target: $("tmTarget"),
  domain: $("tmDomain"), status: $("tmStatus"), document: $("tmDocument"), save: $("tmSave"), clear: $("tmClear"), delete: $("tmDelete"), importFile: $("tmImportFile"),
  exportJson: $("tmExportJson"), exportCsv: $("tmExportCsv"), exportTmx: $("tmExportTmx"), statusText: $("tmStatusText"), stats: $("tmStats"), suggestions: $("tmSuggestions"), list: $("tmList"),
};
let segments = load();
let editingId = null;

function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(sanitizeSegment).filter(Boolean); } catch { return []; } }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(segments)); }
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }
function domainLabel(value) { return { politics: "Политика", culture: "Культура", religion: "Религия", military: "Военная тематика" }[value] || value; }
function statusLabel(value) { return { machine: "Машинный", reviewed: "Проверено", verified: "Подтверждено" }[value] || value; }

function render() {
  ui.count.textContent = `${segments.length} сегментов`;
  const filtered = segments.filter((row) => (ui.domainFilter.value === "all" || row.domain === ui.domainFilter.value) && (ui.statusFilter.value === "all" || row.status === ui.statusFilter.value)).slice().reverse();
  ui.list.innerHTML = filtered.length ? filtered.slice(0, 100).map((row) => `<article class="tm-card" data-tm-id="${escapeHtml(row.id)}"><div class="tm-card-meta"><span>${domainLabel(row.domain)}</span><span class="tm-status-${row.status}">${statusLabel(row.status)}</span></div><p lang="ru">${escapeHtml(row.source)}</p><p lang="ms">${escapeHtml(row.target)}</p>${row.document ? `<small>Источник: ${escapeHtml(row.document)}</small>` : ""}</article>`).join("") : '<p class="tm-empty">По выбранным фильтрам сегментов нет.</p>';
  const stats = memoryStats(segments);
  ui.stats.innerHTML = `<span class="tm-stat">Всего: ${stats.total}</span><span class="tm-stat">Подтверждено: ${stats.verified}</span><span class="tm-stat">Проверено: ${stats.reviewed}</span><span class="tm-stat">Машинных: ${stats.machine}</span>`;
  renderSuggestions();
}

function renderSuggestions() {
  const matches = rankSegments(ui.search.value, segments, ui.domainFilter.value, ui.statusFilter.value).slice(0, 12);
  ui.suggestions.innerHTML = matches.map((row) => `<button type="button" class="tm-match" data-tm-id="${escapeHtml(row.id)}"><strong>${row.score}%</strong><span>${escapeHtml(row.source)}</span><span>${escapeHtml(row.target)}</span><small>${domainLabel(row.domain)} · ${statusLabel(row.status)} · совпадение по ${row.matchedField === "target" ? "переводу" : "оригиналу"}</small></button>`).join("");
}

function saveSegment() {
  const row = sanitizeSegment({ source: ui.source.value, target: ui.target.value, domain: ui.domain.value, status: ui.status.value, document: ui.document.value, author: "Чернобаев Б.Д." });
  if (!row) { ui.statusText.textContent = "Заполните оригинал и перевод."; return; }
  const selected = editingId ? segments.findIndex((item) => item.id === editingId) : -1;
  const duplicate = segments.findIndex((item) => item.source.toLowerCase() === row.source.toLowerCase() && item.target.toLowerCase() === row.target.toLowerCase());
  if (selected >= 0) segments[selected] = { ...segments[selected], ...row, id: editingId, createdAt: segments[selected].createdAt };
  else if (duplicate >= 0) segments[duplicate] = { ...segments[duplicate], ...row, id: segments[duplicate].id, createdAt: segments[duplicate].createdAt };
  else segments.push(row);
  persist(); clearEditor(); ui.statusText.textContent = `Сегмент сохранён локально со статусом «${statusLabel(row.status)}».`; render();
}

function clearEditor() { editingId = null; ui.source.value = ""; ui.target.value = ""; ui.document.value = ""; ui.delete.disabled = true; ui.save.textContent = "Сохранить сегмент"; }
function selectSegment(row) { editingId = row.id; ui.source.value = row.source; ui.target.value = row.target; ui.domain.value = row.domain; ui.status.value = row.status; ui.document.value = row.document || ""; ui.delete.disabled = false; ui.save.textContent = "Обновить сегмент"; }
function deleteSelected() { if (!editingId) return; segments = segments.filter((row) => row.id !== editingId); persist(); clearEditor(); ui.statusText.textContent = "Выбранный сегмент удалён из локальной памяти."; render(); }
function download(content, name, type) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }

ui.tabs.forEach((button) => button.addEventListener("click", () => {
  const memory = button.dataset.productTab === "memory";
  ui.dictionaryPanel.hidden = memory; ui.memoryPanel.hidden = !memory;
  ui.tabs.forEach((tab) => tab.classList.toggle("active", tab === button));
}));
ui.save.addEventListener("click", saveSegment);
ui.clear.addEventListener("click", clearEditor);
ui.delete.addEventListener("click", deleteSelected);
ui.search.addEventListener("input", renderSuggestions);
ui.domainFilter.addEventListener("change", render);
ui.statusFilter.addEventListener("change", render);
for (const container of [ui.suggestions, ui.list]) container.addEventListener("click", (event) => { const item = event.target.closest("[data-tm-id]"); const row = segments.find((entry) => entry.id === item?.dataset.tmId); if (row) selectSegment(row); });
ui.importFile.addEventListener("change", async () => {
  const file = ui.importFile.files?.[0]; if (!file) return;
  try { const imported = parseImportedMemory(await file.text(), file.name.toLowerCase().endsWith(".csv") ? "csv" : "json"); const merged = mergeSegments(segments, imported); segments = merged.segments; persist(); ui.statusText.textContent = `Импорт: добавлено ${merged.added}, обновлено ${merged.updated}, пропущено дублей ${merged.skipped}. Машинные переводы требуют проверки.`; render(); }
  catch (error) { ui.statusText.textContent = `Импорт не выполнен: ${error.message}`; }
  ui.importFile.value = "";
});
ui.exportJson.addEventListener("click", () => download(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), segments }, null, 2), "translation-memory.json", "application/json"));
ui.exportCsv.addEventListener("click", () => download(toCsv(segments), "translation-memory.csv", "text/csv;charset=utf-8"));
ui.exportTmx.addEventListener("click", () => download(toTmx(segments), "translation-memory.tmx", "application/xml"));
render();
