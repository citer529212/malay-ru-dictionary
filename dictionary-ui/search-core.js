export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeadwordLoose(text) {
  return normalizeText(text)
    .replace(/[^a-zа-яё0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRussianStem(word) {
  const w = normalizeText(word);
  if (!/^[а-яё-]+$/i.test(w) || w.length <= 4) return w;

  const endings = [
    "ями", "ами", "ого", "ему", "ому", "его", "ыми", "ими", "иях",
    "ах", "ях", "ой", "ий", "ый", "ая", "ое", "ее", "ую", "юю",
    "ов", "ев", "ом", "ем", "ам", "ям", "ы", "и", "а", "я", "у",
    "ю", "е", "о",
  ];

  for (const ending of endings) {
    if (w.endsWith(ending) && w.length - ending.length >= 3) {
      return w.slice(0, -ending.length);
    }
  }
  return w;
}

export function normalizeRussianSearchKey(value) {
  return normalizeHeadwordLoose(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      normalizeRussianStem(word)
        .replace(/ь/g, "")
        .replace(/й/g, "и")
        .replace(/([бвгджзклмнпрстфхцчшщ])\1$/u, "$1")
    )
    .join(" ");
}

export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function russianTypoDistanceLimit(key) {
  const compactLength = String(key || "").replace(/\s/g, "").length;
  if (compactLength >= 9) return 2;
  if (compactLength >= 5) return 1;
  return 0;
}
