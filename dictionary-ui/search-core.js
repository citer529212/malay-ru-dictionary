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

function addMalayCandidate(result, value) {
  const candidate = normalizeHeadwordLoose(value);
  if (/^[a-z][a-z-]{2,}$/i.test(candidate)) result.add(candidate);
}

export function generateMalayBaseCandidates(value) {
  const word = normalizeHeadwordLoose(value);
  const result = new Set();
  if (!/^[a-z][a-z-]{2,}$/i.test(word)) return [];

  const repeated = word.match(/^([a-z]+)-\1$/i);
  if (repeated) addMalayCandidate(result, repeated[1]);

  const forms = new Set([word]);
  const suffixes = ["kan", "an", "i"];
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      const withoutSuffix = word.slice(0, -suffix.length);
      forms.add(withoutSuffix);
      addMalayCandidate(result, withoutSuffix);
    }
  }

  for (const form of forms) {
    const directPrefixes = ["meng", "men", "mem", "meny", "ber", "bel", "ter", "per", "pel", "pen", "pem", "peng", "peny", "di", "ke", "se", "pe"];
    for (const prefix of directPrefixes) {
      if (form.startsWith(prefix) && form.length - prefix.length >= 3) {
        addMalayCandidate(result, form.slice(prefix.length));
      }
    }

    if (/^men[aeiou]/.test(form)) addMalayCandidate(result, `t${form.slice(3)}`);
    if (/^mem[aeiou]/.test(form)) addMalayCandidate(result, `p${form.slice(3)}`);
    if (/^meny[aeiou]/.test(form)) addMalayCandidate(result, `s${form.slice(4)}`);
    if (/^meng[aeiou]/.test(form)) addMalayCandidate(result, form.slice(4));
    if (/^pen[aeiou]/.test(form)) addMalayCandidate(result, `t${form.slice(3)}`);
    if (/^pem[aeiou]/.test(form)) addMalayCandidate(result, `p${form.slice(3)}`);
    if (/^peny[aeiou]/.test(form)) addMalayCandidate(result, `s${form.slice(4)}`);
    if (/^peng[aeiou]/.test(form)) addMalayCandidate(result, form.slice(4));
  }

  result.delete(word);
  return [...result];
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

export function detectQueryScript(query) {
  const value = String(query || "");
  const latin = (value.match(/[a-z]/gi) || []).length;
  const cyrillic = (value.match(/[а-яё]/gi) || []).length;
  if (latin > cyrillic && latin >= 2) return "latin";
  if (cyrillic > latin && cyrillic >= 2) return "cyrillic";
  return "mixed";
}

export function directionForQuery(query) {
  const script = detectQueryScript(query);
  if (script === "cyrillic") return "ru-ms";
  if (script === "latin") return "ms-ru";
  return null;
}
