export const TM_DOMAINS = new Set(["politics", "culture", "religion", "military"]);
export const TM_STATUSES = new Set(["machine", "reviewed", "verified"]);

export function normalizeSegment(value) {
  return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function segmentSimilarity(left, right) {
  const a = new Set(normalizeSegment(left).split(" ").filter(Boolean));
  const b = new Set(normalizeSegment(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return Math.round((shared / Math.max(a.size, b.size)) * 100);
}

export function sanitizeSegment(row, index = 0) {
  const source = String(row?.source || row?.ru || "").trim();
  const target = String(row?.target || row?.ms || "").trim();
  if (!source || !target) return null;
  return {
    id: String(row.id || `tm-${Date.now()}-${index}`),
    source,
    target,
    domain: TM_DOMAINS.has(row.domain) ? row.domain : "politics",
    status: TM_STATUSES.has(row.status) ? row.status : "machine",
    document: String(row.document || "").trim(),
    author: String(row.author || "").trim(),
    createdAt: String(row.createdAt || new Date().toISOString()),
  };
}

export function rankSegments(query, segments, domain = "all") {
  const normalized = normalizeSegment(query);
  if (!normalized) return [];
  return segments
    .filter((row) => domain === "all" || row.domain === domain)
    .map((row) => ({ ...row, score: normalizeSegment(row.source) === normalized ? 100 : segmentSimilarity(query, row.source) }))
    .filter((row) => row.score >= 30)
    .sort((a, b) => b.score - a.score || statusWeight(b.status) - statusWeight(a.status));
}

function statusWeight(status) {
  return status === "verified" ? 3 : status === "reviewed" ? 2 : 1;
}

export function parseImportedMemory(text, extension = "json") {
  if (extension.toLowerCase() === "csv") {
    const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(lines.shift() || "").map((value) => value.toLowerCase());
    return lines.map((line, index) => {
      const values = parseCsvLine(line);
      return sanitizeSegment(Object.fromEntries(headers.map((key, i) => [key, values[i] || ""])), index);
    }).filter(Boolean);
  }
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.segments || parsed.entries || [];
  return rows.map(sanitizeSegment).filter(Boolean);
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

export function toTmx(segments) {
  const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const units = segments.map((row) => `    <tu tuid="${escape(row.id)}"><prop type="domain">${escape(row.domain)}</prop><prop type="status">${escape(row.status)}</prop><tuv xml:lang="ru"><seg>${escape(row.source)}</seg></tuv><tuv xml:lang="ms"><seg>${escape(row.target)}</seg></tuv></tu>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tmx version="1.4"><header creationtool="Kamus Translation Memory" creationtoolversion="1" segtype="sentence" adminlang="ru" srclang="ru" datatype="PlainText"/><body>\n${units}\n</body></tmx>`;
}
