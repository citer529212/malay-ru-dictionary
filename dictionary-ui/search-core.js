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

export function findStructuredSenseIndex(entry, query) {
  const q = normalizeHeadwordLoose(query);
  const title = normalizeHeadwordLoose(entry?.title);
  const senses = Array.isArray(entry?.senses) ? entry.senses : [];
  if (!q || !title || !senses.length || q === title) return -1;

  const normalizedSenses = senses.map((sense) => ({
    label: normalizeHeadwordLoose(sense?.label),
    translation: normalizeHeadwordLoose(sense?.translation),
    example: normalizeHeadwordLoose(sense?.example),
    exampleTranslation: normalizeHeadwordLoose(sense?.exampleTranslation),
  }));

  const exactExampleIndex = normalizedSenses.findIndex((sense) =>
    [sense.example, sense.exampleTranslation].some(
      (value) => value && (value === q || value.includes(q) || q.includes(value))
    )
  );
  if (exactExampleIndex >= 0) return exactExampleIndex;

  const queryTokens = q.split(/\s+/).filter(Boolean);
  const titleWords = title.split(/\s+/).filter(Boolean);
  let headwordTokenIndex = -1;
  if (titleWords.length === 1) {
    const titleWord = titleWords[0];
    headwordTokenIndex = queryTokens.findIndex((token) => {
      if (token === titleWord) return true;
      if (/^[а-яё-]+$/i.test(titleWord) && /^[а-яё-]+$/i.test(token)) {
        const titleKey = normalizeRussianSearchKey(titleWord);
        const tokenKey = normalizeRussianSearchKey(token);
        return (
          titleKey === tokenKey ||
          (titleKey.length >= 4 &&
            tokenKey.length >= 4 &&
            levenshteinDistance(titleKey, tokenKey) <= 1)
        );
      }
      return generateMalayBaseCandidates(token).includes(titleWord);
    });
  }
  const containsHeadword =
    headwordTokenIndex >= 0 || q.startsWith(`${title} `) || q.endsWith(` ${title}`);
  const contextTokens = queryTokens.filter(
    (token, index) => token.length >= 3 && index !== headwordTokenIndex && !titleWords.includes(token)
  );
  if (!containsHeadword || !contextTokens.length) return -1;

  let bestIndex = -1;
  let bestScore = 0;
  normalizedSenses.forEach((sense, index) => {
    const searchable = `${sense.label} ${sense.translation} ${sense.example} ${sense.exampleTranslation}`;
    const searchableRussianKeys = normalizeRussianSearchKey(searchable).split(/\s+/);
    const score = contextTokens.reduce((total, token) => {
      if (searchable.includes(token)) return total + 1;
      if (/^[а-яё-]+$/i.test(token)) {
        const tokenKey = normalizeRussianSearchKey(token);
        if (tokenKey.length >= 3 && searchableRussianKeys.includes(tokenKey)) return total + 1;
      }
      return total;
    }, 0);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestScore > 0 ? bestIndex : -1;
}
