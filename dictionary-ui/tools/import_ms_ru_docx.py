#!/usr/bin/env python3

import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def clean_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def cell_text(cell):
    return clean_text(" ".join(node.text or "" for node in cell.iter(WORD_NS + "t")))


def extract_entries(docx_path):
    with ZipFile(docx_path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))

    entries = []
    for table_index, table in enumerate(root.iter(WORD_NS + "tbl"), start=1):
        for row_index, row in enumerate(table.iter(WORD_NS + "tr"), start=1):
            cells = [cell_text(cell) for cell in row.findall("./" + WORD_NS + "tc")]
            if len(cells) < 2 or not cells[0] or not cells[1]:
                continue
            entries.append(
                {
                    "id": f"ms-source-docx-{table_index:02d}-{row_index:04d}",
                    "title": cells[0],
                    "body": cells[1],
                    "page": 0,
                    "verified": True,
                    "source": "malaysian-russian-ready-docx",
                }
            )
    return entries


def main():
    parser = argparse.ArgumentParser(description="Import MS-RU dictionary tables from DOCX")
    parser.add_argument("docx", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    entries = extract_entries(args.docx)
    if not entries:
        raise SystemExit("No two-column dictionary rows found")

    unique_pairs = {(entry["title"].casefold(), entry["body"].casefold()) for entry in entries}
    unique_titles = {entry["title"].casefold() for entry in entries}
    if len(unique_pairs) != len(entries) or len(unique_titles) != len(entries):
        raise SystemExit("DOCX contains duplicate rows or headwords; review before import")

    payload = {
        "version": 1,
        "direction": "ms-ru",
        "source": args.docx.name,
        "entry_count": len(entries),
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "entries": len(entries)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
