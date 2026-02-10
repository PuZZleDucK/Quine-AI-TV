#!/usr/bin/env python3
"""
Compute % difference between PNGs from a Quine TV screenshot capture run.

Usage:
  python3 scripts/screenshot-diff-percent.py <OUT_DIR>
    - If OUT_DIR/report.json exists: compares consecutive captures in report order,
      and also compares within each channel when there are multiple frames/offsets.
    - Otherwise: compares consecutive *.png files sorted by name.

  python3 scripts/screenshot-diff-percent.py <OUT_DIR> --against <OTHER_DIR>
    - Compares same-named PNGs between two runs.

Output:
  TSV to stdout with per-pair metrics:
    changed_px_pct: percent of pixels where any channel differs
    mad_pct: mean absolute difference per channel, normalized to [0..100]
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class Capture:
  number: int
  id: str
  name: str
  file: str
  t_ms: int | None = None
  frame: int | None = None
  offset_ms: int | None = None


def _load_rgba(path: Path) -> np.ndarray:
  # Ensure we fully decode before closing the file handle.
  with Image.open(path) as im:
    im = im.convert("RGBA")
    return np.asarray(im, dtype=np.uint8)


def diff_metrics(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
  if a.shape != b.shape:
    raise ValueError(f"size mismatch: {a.shape} vs {b.shape}")
  # Any-channel change per pixel.
  changed = np.any(a != b, axis=2)
  changed_px_pct = float(changed.mean() * 100.0)
  # Mean absolute difference per channel, normalized to [0..100].
  mad_pct = float(np.mean(np.abs(a.astype(np.int16) - b.astype(np.int16))) / 255.0 * 100.0)
  return changed_px_pct, mad_pct


def read_report(out_dir: Path) -> list[Capture]:
  report_path = out_dir / "report.json"
  if not report_path.exists():
    return []
  data = json.loads(report_path.read_text(encoding="utf-8"))
  caps: list[Capture] = []
  for item in data.get("captures", []):
    caps.append(
      Capture(
        number=int(item.get("number") or 0),
        id=str(item.get("id") or ""),
        name=str(item.get("name") or ""),
        file=str(item.get("file") or ""),
        t_ms=int(item["tMs"]) if "tMs" in item else None,
        frame=int(item["frame"]) if "frame" in item else None,
        offset_ms=int(item["offsetMs"]) if "offsetMs" in item else None,
      )
    )
  return caps


def iter_pngs_sorted(out_dir: Path) -> list[str]:
  return sorted([p.name for p in out_dir.glob("*.png")])


def _print_tsv(rows: Iterable[list[Any]]) -> None:
  for r in rows:
    print("\t".join("" if v is None else str(v) for v in r))


def compare_sequence(out_dir: Path, files: list[str], label: str) -> int:
  if len(files) < 2:
    print(f"# {label}: need >= 2 images, found {len(files)}")
    return 0

  rows: list[list[Any]] = []
  rows.append(
    [
      "mode",
      "a",
      "b",
      "changed_px_pct",
      "mad_pct",
    ]
  )

  # Cache decoded arrays for speed in case of repeated comparisons.
  cache: dict[str, np.ndarray] = {}

  def load(name: str) -> np.ndarray:
    if name not in cache:
      cache[name] = _load_rgba(out_dir / name)
    return cache[name]

  n = 0
  for a_name, b_name in zip(files, files[1:]):
    a = load(a_name)
    b = load(b_name)
    changed_px_pct, mad_pct = diff_metrics(a, b)
    rows.append(["sequence", a_name, b_name, f"{changed_px_pct:.4f}", f"{mad_pct:.4f}"])
    n += 1

  print(f"# {label}: compared {n} pairs in {out_dir}")
  _print_tsv(rows)
  return n


def compare_report(out_dir: Path, caps: list[Capture]) -> None:
  files = [c.file for c in caps if c.file]
  compare_sequence(out_dir, files, label="report-order")

  # Within-channel comparisons (only meaningful when FRAMES>1 or OFFSETS_MS is set).
  by_chan: dict[tuple[int, str], list[Capture]] = {}
  for c in caps:
    by_chan.setdefault((c.number, c.id), []).append(c)

  for (num, cid), group in sorted(by_chan.items(), key=lambda x: x[0][0]):
    if len(group) < 2:
      continue
    # Order by offset/frame/tMs best-effort.
    def key(c: Capture) -> tuple[int, int, int]:
      return (
        int(c.offset_ms if c.offset_ms is not None else 1_000_000_000),
        int(c.frame if c.frame is not None else 1_000_000_000),
        int(c.t_ms if c.t_ms is not None else 1_000_000_000),
      )

    group_sorted = sorted(group, key=key)
    files = [c.file for c in group_sorted]
    compare_sequence(out_dir, files, label=f"channel {num:02d} {cid}")


def compare_against(a_dir: Path, b_dir: Path) -> None:
  a_files = set(iter_pngs_sorted(a_dir))
  b_files = set(iter_pngs_sorted(b_dir))
  common = sorted(a_files & b_files)
  missing_a = sorted(b_files - a_files)
  missing_b = sorted(a_files - b_files)

  if missing_a:
    print(f"# warning: {len(missing_a)} pngs only in --against dir (ignored)")
  if missing_b:
    print(f"# warning: {len(missing_b)} pngs only in base dir (ignored)")

  rows: list[list[Any]] = []
  rows.append(
    [
      "mode",
      "file",
      "changed_px_pct",
      "mad_pct",
    ]
  )

  n = 0
  for name in common:
    a = _load_rgba(a_dir / name)
    b = _load_rgba(b_dir / name)
    changed_px_pct, mad_pct = diff_metrics(a, b)
    rows.append(["against", name, f"{changed_px_pct:.4f}", f"{mad_pct:.4f}"])
    n += 1

  print(f"# against: compared {n} common files")
  _print_tsv(rows)


def main() -> int:
  ap = argparse.ArgumentParser()
  ap.add_argument("out_dir", type=Path)
  ap.add_argument("--against", type=Path, default=None)
  args = ap.parse_args()

  out_dir: Path = args.out_dir
  if not out_dir.exists():
    raise SystemExit(f"not found: {out_dir}")

  if args.against is not None:
    b_dir: Path = args.against
    if not b_dir.exists():
      raise SystemExit(f"not found: {b_dir}")
    compare_against(out_dir, b_dir)
    return 0

  caps = read_report(out_dir)
  if caps:
    compare_report(out_dir, caps)
    return 0

  files = iter_pngs_sorted(out_dir)
  compare_sequence(out_dir, files, label="name-order")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

