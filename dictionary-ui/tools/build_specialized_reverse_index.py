#!/usr/bin/env python3

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip(" .,:;-")


def split_top_level(value):
    parts = []
    start = 0
    depth = 0
    for index, char in enumerate(value):
        if char == "(":
            depth += 1
        elif char == ")" and depth:
            depth -= 1
        elif char in ",;" and depth == 0:
            parts.append(value[start:index])
            start = index + 1
    parts.append(value[start:])
    return parts


def russian_variants(value):
    value = clean(value)
    candidates = [value, re.sub(r"\s*\([^)]*\)", "", value), *split_top_level(value)]
    candidates.extend(re.findall(r"\(([^()]*[а-яё][^()]*)\)", value, flags=re.I))

    result = []
    seen = set()
    for candidate in candidates:
        candidate = clean(candidate)
        candidate = re.sub(r"^(?:разг|воен|ав|мор|мед|тех)\.\s*", "", candidate, flags=re.I)
        key = candidate.casefold().replace("ё", "е")
        if len(candidate) < 2 or not re.search(r"[а-яё]", candidate, flags=re.I) or key in seen:
            continue
        seen.add(key)
        result.append(candidate)
    return result


def main():
    parser = argparse.ArgumentParser(description="Build RU-MS reverse index from specialized MS-RU JSON")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.source.read_text(encoding="utf-8"))
    translations = defaultdict(list)
    display_titles = {}
    relation_count = 0

    for entry in payload.get("entries", []):
        malay = clean(entry.get("title"))
        if not malay:
            continue
        for russian in russian_variants(entry.get("body")):
            key = russian.casefold().replace("ё", "е")
            display_titles.setdefault(key, russian)
            if malay not in translations[key]:
                translations[key].append(malay)
                relation_count += 1

    entries = []
    for index, key in enumerate(sorted(translations), start=1):
        entries.append(
            {
                "id": f"ru-source-reverse-{index:05d}",
                "title": display_titles[key],
                "body": "; ".join(translations[key]),
                "page": 0,
                "verified": True,
                "trusted": True,
                "source": "reverse-index-from-malaysian-russian-ready-docx",
            }
        )

    output = {
        "version": 1,
        "direction": "ru-ms",
        "source": args.source.name,
        "entry_count": len(entries),
        "relation_count": relation_count,
        "entries": entries,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"entries": len(entries), "relations": relation_count}, ensure_ascii=False))


if __name__ == "__main__":
    main()
