#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

LAT_HEAD_RE = re.compile(r"^([a-z][a-z'\- ]{1,40}?)(?:\s+[ivx]{1,4})?(?:\s+[12])?\s+(.+)$", re.I)
RU_HEAD_RE = re.compile(r"^([А-ЯЁа-яё][А-ЯЁа-яё\- ]{1,40}?)(?:\s+[IVXivx]{1,4})?(?:\s+[12])?\s+(.+)$")

CYR_CONF_MAP = str.maketrans(
    {
        "A": "А", "B": "В", "C": "С", "E": "Е", "H": "Н", "K": "К", "M": "М", "O": "О", "P": "Р", "T": "Т", "X": "Х", "Y": "У",
        "a": "а", "c": "с", "e": "е", "o": "о", "p": "р", "x": "х", "y": "у", "k": "к", "m": "м", "t": "т",
    }
)

RU_STOP = {"и", "в", "на", "с", "к", "по", "из", "до", "для", "под", "над", "а", "но"}

MSRU_TEST_WORDS = [
    "air","api","batu","besar","buruk","cantik","cepat","cinta","darat","dua","emas","gelap","gunung","hari","hijau","hitam","jalan","jauh",
    "kecil","kuning","langit","laut","lelaki","malam","matahari","merah","minum","orang","panas","perempuan","putih","rumah","satu","tanah","tiga","warna"
]

RUMS_TEST_WORDS = [
    "большой","вода","воздух","время","гора","город","день","дом","друг","дорога","женщина","желтый","земля","зеленый","золотой","камень","книга",
    "красный","луна","маленький","мать","мужчина","море","небо","ночь","огонь","отец","работа","ребенок","рука","сестра","синий","солнце","человек","черный"
]


def clean(text: str) -> str:
    text = text.replace("\u00ad", "")
    text = text.replace("|", " ")
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl")
    text = re.sub(r"\s+", " ", text)
    return text.strip(" -\t")


def normalize_ru_ocr(text: str) -> str:
    text = clean(text).translate(CYR_CONF_MAP)
    text = re.sub(r"[^А-ЯЁа-яё\- ]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def title_key(title: str, direction: str) -> str:
    t = clean(title).lower().replace("ё", "е")
    if direction == "ru-ms":
        t = normalize_ru_ocr(t).lower().replace("ё", "е")
    t = re.sub(r"\s+", " ", t)
    return t


def body_key(body: str) -> str:
    b = clean(body).lower().replace("ё", "е")
    b = re.sub(r"\s+", " ", b)
    return b


@dataclass
class Entry:
    title: str
    body: str
    page: int
    quality: float


def score_msru(title: str, body: str) -> float:
    score = 0.0
    if re.fullmatch(r"[a-z][a-z'\- ]{1,35}", title, re.I):
        score += 2.0
    if 2 <= len(title) <= 24:
        score += 1.0
    if re.search(r"[а-яё]", body, re.I):
        score += 2.0
    if re.search(r"[;,:~()]", body):
        score += 0.7
    if 4 <= len(body) <= 220:
        score += 1.0
    if re.search(r"[0-9]{4,}", body):
        score -= 1.0
    if re.search(r"[_{}<>|]", body):
        score -= 1.5
    return score


def score_rums(title: str, body: str) -> float:
    score = 0.0
    if re.fullmatch(r"[а-яё][а-яё\- ]{1,35}", title, re.I):
        score += 2.0
    if title.lower() not in RU_STOP and 2 <= len(title) <= 28:
        score += 1.2
    lat = len(re.findall(r"[a-z]", body, re.I))
    cyr = len(re.findall(r"[а-яё]", body, re.I))
    if lat >= 3:
        score += 2.0
    if cyr <= max(8, int(lat * 0.35)):
        score += 0.8
    if 3 <= len(body) <= 220:
        score += 1.0
    if re.search(r"[_{}<>|]", body):
        score -= 1.5
    return score


def parse_sidecar(sidecar_text: str, direction: str, min_quality: float) -> tuple[list[Entry], dict]:
    pages = sidecar_text.split("\f")
    accepted: list[Entry] = []
    stats = {"pages": len(pages), "candidates": 0, "accepted": 0, "rejected": 0}

    for page_idx, page in enumerate(pages, start=1):
        lines = [clean(x) for x in page.splitlines()]
        lines = [x for x in lines if x and not x.startswith("[OCR skipped on page")]

        current_title = ""
        current_body_parts: list[str] = []

        def flush():
            nonlocal current_title, current_body_parts
            if not current_title:
                return
            title = clean(current_title)
            body = clean(" ".join(current_body_parts))
            if direction == "ru-ms":
                title = normalize_ru_ocr(title).lower()
                q = score_rums(title, body)
            else:
                title = title.lower()
                q = score_msru(title, body)
            stats["candidates"] += 1
            if q >= min_quality:
                accepted.append(Entry(title=title, body=body, page=page_idx, quality=q))
                stats["accepted"] += 1
            else:
                stats["rejected"] += 1
            current_title = ""
            current_body_parts = []

        for line in lines:
            m = (RU_HEAD_RE if direction == "ru-ms" else LAT_HEAD_RE).match(line)
            if m:
                flush()
                current_title = m.group(1)
                current_body_parts = [m.group(2)]
                continue

            if current_title:
                if len(line) <= 240:
                    current_body_parts.append(line)
                    continue
                flush()

            # fallback pattern: header on one line, translation on next line
            if direction == "ru-ms":
                maybe_head = normalize_ru_ocr(line)
                if re.fullmatch(r"[А-ЯЁа-яё][А-ЯЁа-яё\- ]{1,35}", maybe_head):
                    flush()
                    current_title = maybe_head
                    current_body_parts = []
            else:
                if re.fullmatch(r"[a-z][a-z'\- ]{1,35}", line, re.I):
                    flush()
                    current_title = line
                    current_body_parts = []

        flush()

    return accepted, stats


def dedupe(entries: Iterable[Entry], direction: str) -> list[dict]:
    seen = {}
    for e in entries:
        k = (title_key(e.title, direction), body_key(e.body))
        prev = seen.get(k)
        if prev is None or e.quality > prev.quality:
            seen[k] = e

    out = []
    for i, e in enumerate(sorted(seen.values(), key=lambda x: (title_key(x.title, direction), x.page))):
        out.append(
            {
                "id": f"{direction}-v2-{i}",
                "type": "entry",
                "title": clean(e.title),
                "body": clean(e.body),
                "page": int(e.page),
                "verified": True,
                "quality_score": round(float(e.quality), 3),
            }
        )
    return out


def load_entries(path: Path) -> list[dict]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("entries", [])


def merge_gold(curated_entries: list[dict], gold_entries: list[dict], direction: str) -> list[dict]:
    if not gold_entries:
        return curated_entries
    out = []
    seen = set()

    for src in (gold_entries, curated_entries):
        for e in src:
            tk = title_key(e.get("title", ""), direction)
            if not tk:
                continue
            if tk in seen:
                continue
            seen.add(tk)
            out.append(e)
    return out


def coverage(entries: list[dict], test_words: list[str], direction: str) -> dict:
    keys = {title_key(e.get("title", ""), direction) for e in entries}
    missing = []
    for w in test_words:
        if title_key(w, direction) not in keys:
            missing.append(w)
    return {
        "test_set_size": len(test_words),
        "covered": len(test_words) - len(missing),
        "coverage_pct": round((len(test_words) - len(missing)) * 100.0 / max(1, len(test_words)), 2),
        "missing_examples": missing[:30],
    }


def save_payload(path: Path, source: str, direction: str, entries: list[dict]):
    payload = {
        "version": "2",
        "source": source,
        "direction": direction,
        "entries": entries,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_sidecar(
    sidecar_arg: str | None,
    pdf_arg: str | None,
    default_sidecar_path: Path,
    extract_script_path: Path,
    chunk_size: int,
):
    if sidecar_arg:
        return Path(sidecar_arg)
    if not pdf_arg:
        return None

    pdf_path = Path(pdf_arg)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    default_sidecar_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        npages = int(
            subprocess.check_output(["qpdf", "--show-npages", str(pdf_path)], text=True).strip()
        )
    except Exception:
        npages = 2000

    cmd = [
        "python3",
        str(extract_script_path),
        "--input",
        str(pdf_path),
        "--output",
        str(default_sidecar_path),
        "--start",
        "1",
        "--end",
        str(npages),
        "--chunk-size",
        str(chunk_size),
    ]
    subprocess.run(cmd, check=True)
    return default_sidecar_path


def main():
    parser = argparse.ArgumentParser(description="Dictionary pipeline v2: sidecar -> curated JSON + quality report")
    parser.add_argument("--ms-ru-sidecar", help="Path to OCR sidecar for Malay->Russian dictionary")
    parser.add_argument("--ru-ms-sidecar", help="Path to OCR sidecar for Russian->Malay dictionary")
    parser.add_argument("--ms-ru-pdf", help="Path to OCR PDF for Malay->Russian dictionary")
    parser.add_argument("--ru-ms-pdf", help="Path to OCR PDF for Russian->Malay dictionary")
    parser.add_argument("--output-dir", default="./data", help="dictionary-ui/data directory")
    parser.add_argument("--min-quality-msru", type=float, default=4.2)
    parser.add_argument("--min-quality-rums", type=float, default=4.0)
    parser.add_argument("--ocr-chunk-size", type=int, default=80, help="Chunk size for qpdf extraction")
    parser.add_argument("--report", default="./data/dictionary_pipeline_report.json")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    tools_dir = Path(__file__).resolve().parent
    extract_script = tools_dir / "extract_text_from_ocr_pdf.py"
    cache_dir = output_dir / "_sidecar_cache"
    report = {"pipeline": "dictionary_v2", "outputs": {}, "stats": {}}

    msru_sidecar = ensure_sidecar(
        sidecar_arg=args.ms_ru_sidecar,
        pdf_arg=args.ms_ru_pdf,
        default_sidecar_path=cache_dir / "ms_ru_sidecar.txt",
        extract_script_path=extract_script,
        chunk_size=args.ocr_chunk_size,
    )
    rums_sidecar = ensure_sidecar(
        sidecar_arg=args.ru_ms_sidecar,
        pdf_arg=args.ru_ms_pdf,
        default_sidecar_path=cache_dir / "ru_ms_sidecar.txt",
        extract_script_path=extract_script,
        chunk_size=args.ocr_chunk_size,
    )

    if msru_sidecar:
        sidecar = Path(msru_sidecar)
        entries_raw, stats = parse_sidecar(sidecar.read_text(encoding="utf-8", errors="ignore"), "ms-ru", args.min_quality_msru)
        curated = dedupe(entries_raw, "ms-ru")
        out_path = output_dir / "dictionary_curated.json"
        save_payload(out_path, sidecar.name, "ms-ru", curated)
        rep = coverage(curated, MSRU_TEST_WORDS, "ms-ru")
        report["outputs"]["ms-ru"] = str(out_path)
        report["stats"]["ms-ru"] = {**stats, "final_entries": len(curated), **rep}

    if rums_sidecar:
        sidecar = Path(rums_sidecar)
        entries_raw, stats = parse_sidecar(sidecar.read_text(encoding="utf-8", errors="ignore"), "ru-ms", args.min_quality_rums)
        curated = dedupe(entries_raw, "ru-ms")
        gold = load_entries(output_dir / "dictionary_ru_ms_gold.json")
        curated = merge_gold(curated, gold, "ru-ms")
        out_path = output_dir / "dictionary_ru_ms_curated.json"
        save_payload(out_path, sidecar.name, "ru-ms", curated)
        rep = coverage(curated, RUMS_TEST_WORDS, "ru-ms")
        report["outputs"]["ru-ms"] = str(out_path)
        report["stats"]["ru-ms"] = {**stats, "gold_entries": len(gold), "final_entries": len(curated), **rep}

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
