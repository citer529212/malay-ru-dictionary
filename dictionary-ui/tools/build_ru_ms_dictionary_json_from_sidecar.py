#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


RU_HEAD_RE = re.compile(r"^([A-Za-zА-ЯЁа-яё][A-Za-zА-ЯЁа-яё\-]{1,34})(?:\s+[IVXivx]{1,4})?(?:\s+[12])?\s+(.+)$")
RU_ONLY_RE = re.compile(r"^[A-Za-zА-ЯЁа-яё][A-Za-zА-ЯЁа-яё\- ]{1,35}$")


def clean(text: str) -> str:
    text = text.replace("\u00ad", "")
    text = text.replace("|", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip(" -\t")


CYR_CONF_MAP = str.maketrans(
    {
        "A": "А",
        "B": "В",
        "C": "С",
        "E": "Е",
        "H": "Н",
        "K": "К",
        "M": "М",
        "O": "О",
        "P": "Р",
        "T": "Т",
        "X": "Х",
        "Y": "У",
        "a": "а",
        "c": "с",
        "e": "е",
        "o": "о",
        "p": "р",
        "x": "х",
        "y": "у",
        "k": "к",
        "m": "м",
        "t": "т",
        "n": "п",
        "r": "г",
        "u": "и",
        "v": "у",
        "w": "ш",
    }
)


def normalize_ru_ocr_token(token: str) -> str:
    token = clean(token).translate(CYR_CONF_MAP)
    token = re.sub(r"[^А-ЯЁа-яё\- ]", "", token)
    token = re.sub(r"\s+", " ", token).strip()
    return token


def looks_like_ru_headword(text: str) -> bool:
    value = normalize_ru_ocr_token(text)
    if len(value) < 3 or len(value) > 28:
        return False
    if not re.match(r"^[А-ЯЁа-яё][А-ЯЁа-яё\- ]+$", value):
        return False
    stop = {"а", "и", "в", "с", "к", "о", "у", "по", "под", "при", "на"}
    if value.lower() in stop:
        return False
    return True


def looks_like_ms_translation(text: str) -> bool:
    value = clean(text)
    if len(value) < 2:
        return False
    # Malay side should mostly include Latin script.
    lat = len(re.findall(r"[A-Za-z]", value))
    cyr = len(re.findall(r"[А-ЯЁа-яё]", value))
    if lat == 0:
        return False
    if cyr > lat * 0.9:
        return False
    if not re.search(r"[a-z]{3,}", value):
        return False
    return True


def parse_sidecar(content: str):
    pages = content.split("\f")
    entries = []

    for page_idx, page in enumerate(pages, start=1):
        lines = [clean(x) for x in page.splitlines()]
        lines = [x for x in lines if x]

        current = None

        def flush_current():
            nonlocal current
            if not current:
                return
            title = clean(current["title"]).lower()
            body = clean(current["body"])
            if title and body and looks_like_ru_headword(title) and looks_like_ms_translation(body):
                entries.append({"title": title, "body": body, "page": page_idx})
            current = None

        for line in lines:
            if line.startswith("[OCR skipped on page"):
                continue

            m = RU_HEAD_RE.match(line)
            if m and looks_like_ms_translation(m.group(2)):
                flush_current()
                current = {"title": normalize_ru_ocr_token(m.group(1)), "body": m.group(2)}
                continue

            if current:
                # wrapped translation line
                if len(line) <= 220 and (
                    looks_like_ms_translation(line) or line.startswith("(") or line.startswith("~")
                ):
                    current["body"] += " " + line
                    continue

                # likely next headword
                if RU_ONLY_RE.match(line) and looks_like_ru_headword(line):
                    flush_current()
                    continue

            # fallback: headword-only line, translation on next line
            if looks_like_ru_headword(line):
                current = {"title": normalize_ru_ocr_token(line), "body": ""}

        flush_current()

    dedup = {}
    for entry in entries:
        key = (entry["title"], entry["body"])
        if key not in dedup:
            dedup[key] = entry
        else:
            dedup[key]["page"] = min(dedup[key]["page"], entry["page"])

    final_entries = []
    for idx, item in enumerate(sorted(dedup.values(), key=lambda x: (x["title"], x["page"]))):
        final_entries.append(
            {
                "id": f"ru-lex-{idx}",
                "type": "entry",
                "title": item["title"],
                "body": item["body"],
                "page": item["page"],
            }
        )

    return final_entries


def main():
    parser = argparse.ArgumentParser(description="Build RU->MS dictionary JSON from OCR sidecar text")
    parser.add_argument("--sidecar", required=True, help="Path to sidecar .txt from ocrmypdf")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    sidecar_path = Path(args.sidecar)
    output_path = Path(args.output)

    content = sidecar_path.read_text(encoding="utf-8", errors="ignore")
    entries = parse_sidecar(content)

    payload = {
        "version": "1",
        "source": sidecar_path.name,
        "direction": "ru-ms",
        "entries": entries,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Built {len(entries)} entries -> {output_path}")


if __name__ == "__main__":
    main()
