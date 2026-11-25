#!/usr/bin/env python3
"""For every PNG under tests/screenshots/<project>/nextViewport/<spec>/,
finds the best-matching legacy baseline (same spec stripped of `next` prefix,
matching filename through heuristics like `cpu-` stripping and the
`setVoi -> setVoiRange` style aliases) and emits a self-contained HTML
viewer with side-by-side and blink modes. Helps eyeball whether each
next-only baseline really *needs* to be next-only or could share with legacy.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError as exc:
    sys.exit(
        f"missing dependency: {exc.name}. Install with:\n"
        "  python3 -m pip install Pillow numpy"
    )

REPO = Path(__file__).resolve().parents[2]
TESTS = REPO / "tests"
PROJECT = "chromium"
NEXT_ROOT = TESTS / "screenshots" / PROJECT / "nextViewport"
LEGACY_ROOT = TESTS / "screenshots" / PROJECT

OUT_DIR = TESTS / "compat-diff" / "next-vs-legacy"
OUT_HTML = TESTS / "compat-diff" / "next-vs-legacy.html"

# Maps a next-spec directory (relative to nextViewport/) to its legacy
# counterpart directory (relative to chromium/). Most are "drop the
# `next` prefix and lower-case the first letter".
SPEC_MAP: dict[str, list[str]] = {
    "nextDicomImageLoaderWADOURI.spec.ts": ["dicomImageLoaderWADOURI.spec.ts"],
    "nextEcg.spec.ts": [],  # no legacy
    "nextLabelmapOverlapPlayground.spec.ts": [],  # next-only feature
    "nextLabelmapRendering.spec.ts": ["labelmapRendering.spec.ts", "labelmapRenderingTiled.spec.ts"],
    "nextLabelmapSegmentationTools.spec.ts": ["labelmapsegmentationtools.spec.ts"],
    "nextLabelmapSliceRendering.spec.ts": ["labelmapRendering.spec.ts"],
    "nextLabelmapSliceRenderingTools.spec.ts": ["labelmapsegmentationtools.spec.ts"],
    "nextMultiVolumeAPI.spec.ts": [],  # next-only
    "nextStackAPI.spec.ts": ["stackAPI.spec.ts"],
    "nextStackLabelmapSegmentation.spec.ts": [
        "stackLabelmapSegmentation/circularBrush.spec.ts",
        "stackLabelmapSegmentation/circularEraser1.spec.ts",
    ],
    "nextStackManipulationTools.spec.ts": ["stackManipulationTools.spec.ts"],
    "nextStackPosition.spec.ts": ["stackPosition.spec.ts"],
    "nextVideo.spec.ts": [],  # next-only
    "nextViewportScale.spec.ts": [],  # next-only
    "nextViewReferenceViewable.spec.ts": [],  # next-only (no PNG anyway)
    "nextVolumeAnnotationTools.spec.ts": [
        "volumeAnnotation.spec.ts",
        "volumeAnnotationTiled.spec.ts",
    ],
    "nextWsi.spec.ts": [],  # next-only
}

# Maps next baseline stem -> legacy baseline stem when they're named
# differently (e.g. the stackAPI 'setVoi' / 'rotate' / 'reset' shortcuts).
NAME_ALIASES: dict[str, list[str]] = {
    "setVoi": ["setVoiRange"],
    "rotate": ["rotateAbsolute150"],
    "reset": ["resetViewport"],
    "brush": ["circularBrushSegment1"],
    "length": ["lengthTool"],
    "axial-manip": ["axial"],
    "sagittal-manip": ["sagittal"],
    "coronal-manip": ["coronal"],
}


def candidate_legacy_stems(next_stem: str) -> list[str]:
    """Possible legacy basenames (no extension) for a given next basename."""
    stems: list[str] = []
    # Strip cpu- prefix so cpu-flipH falls back to flipH lookups.
    base = next_stem[4:] if next_stem.startswith("cpu-") else next_stem
    stems.append(base)
    stems.extend(NAME_ALIASES.get(base, []))
    return stems


def find_legacy_match(next_spec: str, next_file: Path) -> Path | None:
    targets = SPEC_MAP.get(next_spec, [])
    if not targets:
        return None
    stem = next_file.stem
    for legacy_rel in targets:
        legacy_dir = LEGACY_ROOT / legacy_rel
        if not legacy_dir.is_dir():
            continue
        for candidate in candidate_legacy_stems(stem):
            candidate_file = legacy_dir / f"{candidate}.png"
            if candidate_file.exists():
                return candidate_file
    return None


def compute_diff(
    next_path: Path, legacy_path: Path, diff_out: Path
) -> dict[str, float | int | bool]:
    """Compute pixel diff between two PNGs and save a diff visualization.

    Returns stats: total/diffPixels/ratio + size_mismatch flag. Pixels
    diverging by >0.005*255 on any channel count as different (same threshold
    as checkForCanvasSnapshot's shared-baseline comparator)."""
    n = np.array(Image.open(next_path).convert("RGBA"))
    g = np.array(Image.open(legacy_path).convert("RGBA"))

    if n.shape != g.shape:
        # Size mismatch — render the next image and overlay a hint stripe so the
        # viewer still has something to display; flag stats.
        Image.fromarray(n).save(diff_out)
        return {
            "size_mismatch": True,
            "next_size": [int(n.shape[1]), int(n.shape[0])],
            "legacy_size": [int(g.shape[1]), int(g.shape[0])],
            "diff_pixels": int(n.shape[0] * n.shape[1]),
            "total_pixels": int(n.shape[0] * n.shape[1]),
            "ratio": 1.0,
        }

    cutoff = 0.005 * 255
    diff_mask = np.max(np.abs(n[:, :, :3].astype(int) - g[:, :, :3].astype(int)), axis=2) > cutoff
    diff_pixels = int(diff_mask.sum())
    total_pixels = int(diff_mask.size)
    ratio = diff_pixels / max(total_pixels, 1)

    out = np.empty_like(n)
    # Faded legacy baseline where identical, bright red where different.
    out[..., :3] = (g[..., :3] // 2) + 128
    out[..., 3] = 255
    out[diff_mask, 0] = 255
    out[diff_mask, 1] = 0
    out[diff_mask, 2] = 0
    Image.fromarray(out).save(diff_out)

    return {
        "size_mismatch": False,
        "next_size": [int(n.shape[1]), int(n.shape[0])],
        "legacy_size": [int(g.shape[1]), int(g.shape[0])],
        "diff_pixels": diff_pixels,
        "total_pixels": total_pixels,
        "ratio": ratio,
    }


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Next vs Legacy baselines</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #1a1a2e; color: #e0e0e0; display: flex; height: 100vh; overflow: hidden; }

  .sidebar { width: 340px; min-width: 340px; background: #16213e; border-right: 1px solid #0f3460; display: flex; flex-direction: column; }
  .sidebar-header { padding: 16px; border-bottom: 1px solid #0f3460; }
  .sidebar-header h2 { font-size: 14px; color: #4cc9f0; margin-bottom: 4px; }
  .sidebar-header .stats { font-size: 11px; color: #888; }
  .filter { padding: 8px 16px; border-bottom: 1px solid #0f3460; display: flex; gap: 6px; flex-wrap: wrap; }
  .filter input { flex: 1; padding: 6px 10px; background: #1a1a2e; border: 1px solid #0f3460; color: #e0e0e0; border-radius: 4px; font-size: 13px; outline: none; }
  .filter input:focus { border-color: #4cc9f0; }
  .filter button { padding: 4px 10px; font-size: 11px; background: #1a1a2e; border: 1px solid #0f3460; color: #e0e0e0; cursor: pointer; border-radius: 4px; }
  .filter button.active { background: #4cc9f0; border-color: #4cc9f0; color: #1a1a2e; }
  .sidebar-list { flex: 1; overflow-y: auto; }
  .spec-group { border-bottom: 1px solid #0f3460; }
  .spec-group-header { padding: 8px 16px; font-size: 12px; color: #4cc9f0; background: #1a1a2e; cursor: pointer; user-select: none; position: sticky; top: 0; z-index: 1; }
  .item { padding: 6px 16px 6px 24px; font-size: 12px; cursor: pointer; transition: background 0.15s; display: flex; justify-content: space-between; gap: 8px; }
  .item:hover { background: #1a1a2e; }
  .item.active { background: #0f3460; color: #fff; }
  .item .pill { font-size: 10px; padding: 1px 6px; border-radius: 3px; }
  .pill.paired { background: #2d6a4f; color: #d8f3dc; }
  .pill.next-only { background: #6c2025; color: #f8d7da; }
  .pill.identical { background: #1b4332; color: #b7e4c7; }
  .pill.minor { background: #997404; color: #fff3bf; }
  .pill.major { background: #6c2025; color: #f8d7da; }
  .pill.size { background: #4c1d95; color: #ddd6fe; }

  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #16213e; border-bottom: 1px solid #0f3460; flex-wrap: wrap; }
  .toolbar .title { font-size: 13px; font-weight: 600; flex: 1; min-width: 200px; }
  .toolbar .meta { font-size: 11px; color: #888; }
  .mode-btns, .nav-btns { display: flex; gap: 4px; }
  .mode-btns button, .nav-btns button { padding: 4px 12px; font-size: 12px; background: #1a1a2e; border: 1px solid #0f3460; color: #e0e0e0; cursor: pointer; border-radius: 4px; }
  .mode-btns button.active { background: #4cc9f0; border-color: #4cc9f0; color: #1a1a2e; }
  .blink-controls { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #888; }
  .blink-controls input[type=range] { width: 120px; }
  .git-add-btn { padding: 4px 14px; font-size: 12px; font-weight: 600; background: #2d6a4f; border: 1px solid #40916c; color: #fff; cursor: pointer; border-radius: 4px; transition: all 0.15s; }
  .git-add-btn:hover:not(:disabled) { background: #40916c; }
  .git-add-btn:disabled { opacity: 0.4; cursor: default; }
  .git-add-btn.staged { background: #0f3460; border-color: #0f3460; cursor: default; }
  .git-add-btn.offline { background: #1a1a2e; border-color: #555; color: #888; cursor: not-allowed; }
  .toast { position: fixed; bottom: 20px; right: 20px; padding: 10px 16px; font-size: 12px; background: #6c2025; color: #f8d7da; border-radius: 4px; opacity: 0; transition: opacity 0.2s; pointer-events: none; max-width: 360px; }
  .toast.show { opacity: 1; }

  .compare-area { flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 20px; position: relative; }

  .blink-stack { position: relative; display: inline-block; }
  .blink-stack img { display: block; max-width: 80vw; max-height: 78vh; image-rendering: pixelated; }
  .blink-stack img.actual { position: absolute; inset: 0; }
  .blink-label { position: absolute; top: 8px; left: 8px; padding: 4px 10px; font-size: 11px; background: rgba(15,52,96,0.85); color: #fff; border-radius: 4px; z-index: 5; }

  .sbs { display: flex; gap: 16px; align-items: flex-start; }
  .sbs .panel { text-align: center; }
  .sbs .panel img { max-width: 38vw; max-height: 78vh; image-rendering: pixelated; display: block; border: 1px solid #0f3460; }
  .sbs .panel-label { font-size: 12px; padding: 6px; color: #4cc9f0; font-weight: 600; }
  .sbs .panel-meta { font-size: 11px; color: #888; padding-bottom: 6px; }

  .diff-wrap { position: relative; display: inline-block; }
  .diff-wrap img { display: block; max-width: 80vw; max-height: 78vh; image-rendering: pixelated; }
  .diff-wrap .overlay { position: absolute; inset: 0; mix-blend-mode: difference; }
  .diff-hint { position: absolute; bottom: 8px; left: 12px; font-size: 11px; color: #888; }

  .single img { max-width: 80vw; max-height: 78vh; image-rendering: pixelated; display: block; }
  .single .panel-label { font-size: 12px; color: #888; padding-bottom: 6px; text-align: center; }

  .empty { color: #555; font-size: 14px; }
  .kbd-hints { position: fixed; bottom: 12px; right: 12px; font-size: 11px; color: #555; }
  .kbd-hints kbd { background: #16213e; border: 1px solid #0f3460; padding: 1px 5px; border-radius: 3px; }
</style>
</head>
<body>

<div class="sidebar">
  <div class="sidebar-header">
    <h2>Next vs Legacy</h2>
    <div class="stats" id="stats"></div>
  </div>
  <div class="filter">
    <input type="text" id="filter" placeholder="Filter..." />
    <button id="filter-all" class="active">All</button>
    <button id="filter-paired">Paired</button>
    <button id="filter-next-only">Next-only</button>
  </div>
  <div class="sidebar-list" id="sidebar-list"></div>
</div>

<div class="main">
  <div class="toolbar">
    <div class="title" id="current-title">Select a screenshot</div>
    <div class="meta" id="current-meta"></div>
    <div class="nav-btns">
      <button onclick="navigate(-1)">Prev</button>
      <button onclick="navigate(1)">Next</button>
    </div>
    <div class="mode-btns">
      <button class="active" data-mode="blink" onclick="setMode('blink')">Blink</button>
      <button data-mode="sbs" onclick="setMode('sbs')">Side-by-Side</button>
      <button data-mode="overlay" onclick="setMode('overlay')">Overlay</button>
      <button data-mode="diff" onclick="setMode('diff')">Diff Image</button>
    </div>
    <button class="git-add-btn offline" id="git-add-btn" onclick="gitAddCurrent()" disabled>Git Add</button>
    <div class="blink-controls" id="blink-controls">
      <span>Blink:</span>
      <input type="range" min="100" max="2000" step="50" value="500" id="blink-speed" />
      <span id="blink-speed-label">500ms</span>
    </div>
  </div>
  <div class="compare-area" id="compare-area">
    <div class="empty">Select a screenshot from the sidebar.</div>
  </div>
</div>

<div class="kbd-hints">
  <kbd>J</kbd>/<kbd>K</kbd> nav &nbsp; <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> mode &nbsp; <kbd>Space</kbd> pause-blink &nbsp; <kbd>A</kbd> git-add &nbsp; <kbd>/</kbd> filter
</div>
<div class="toast" id="toast"></div>

<script id="manifest" type="application/json">__MANIFEST__</script>
<script>
const PAIRS = JSON.parse(document.getElementById("manifest").textContent);
let currentIndex = -1;
let mode = "blink";
let filtered = PAIRS.slice();
let blinkTimer = null;
let blinkPaused = false;
let blinkSpeed = 500;
let pairFilter = "all";
// Pairs already staged via the server. Each key is the next baseline's
// repo-relative path; hiding-on-stage filters the sidebar by this set.
const stagedRepoPaths = new Set();
let serverMode = false;

function pillFor(p) {
  if (!p.legacy) return `<span class="pill next-only">next-only</span>`;
  const stats = p.diff_stats;
  if (!stats) return `<span class="pill paired">paired</span>`;
  if (stats.size_mismatch) {
    return `<span class="pill size">size mismatch</span>`;
  }
  const pct = (stats.ratio * 100);
  if (pct === 0) return `<span class="pill identical">0%</span>`;
  const cls = pct < 1 ? "paired" : pct < 5 ? "minor" : "major";
  return `<span class="pill ${cls}">${pct.toFixed(pct < 1 ? 2 : 1)}%</span>`;
}

function buildSidebar() {
  const list = document.getElementById("sidebar-list");
  const q = document.getElementById("filter").value.toLowerCase();
  filtered = PAIRS.filter(p => {
    if (p.next_repo_path && stagedRepoPaths.has(p.next_repo_path)) return false;
    const matchesText = (p.spec + "/" + p.name).toLowerCase().includes(q);
    const matchesPair =
      pairFilter === "all" ||
      (pairFilter === "paired" && p.legacy) ||
      (pairFilter === "next-only" && !p.legacy);
    return matchesText && matchesPair;
  });
  const paired = PAIRS.filter(p => p.legacy);
  const identical = paired.filter(p => p.diff_stats && p.diff_stats.ratio === 0).length;
  const stagedCount = stagedRepoPaths.size;
  document.getElementById("stats").textContent =
    `${filtered.length} of ${PAIRS.length} shown • ${paired.length} paired (${identical} identical) • ${PAIRS.length - paired.length} next-only${stagedCount ? " • " + stagedCount + " staged (hidden)" : ""}`;
  const groups = {};
  filtered.forEach((p, i) => (groups[p.spec] = groups[p.spec] || []).push({ ...p, _i: i }));
  list.innerHTML = "";
  for (const [spec, items] of Object.entries(groups)) {
    const grp = document.createElement("div");
    grp.className = "spec-group";
    const head = document.createElement("div");
    head.className = "spec-group-header";
    head.textContent = spec;
    grp.appendChild(head);
    const body = document.createElement("div");
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "item" + (it._i === currentIndex ? " active" : "");
      row.innerHTML = `<span>${it.name}</span>${pillFor(it)}`;
      row.dataset.index = it._i;
      row.onclick = () => selectPair(it._i);
      body.appendChild(row);
    });
    grp.appendChild(body);
    list.appendChild(grp);
  }
}

function selectPair(i) {
  if (i < 0 || i >= filtered.length) return;
  currentIndex = i;
  const p = filtered[i];
  document.getElementById("current-title").textContent = `${p.spec} / ${p.name}`;
  let meta = "no legacy match";
  if (p.legacy) {
    const s = p.diff_stats;
    if (s && s.size_mismatch) {
      meta = `legacy: ${p.legacy_label} • size mismatch (next ${s.next_size[0]}x${s.next_size[1]} vs legacy ${s.legacy_size[0]}x${s.legacy_size[1]})`;
    } else if (s) {
      meta = `legacy: ${p.legacy_label} • ${s.diff_pixels.toLocaleString()} px diff (${(s.ratio * 100).toFixed(2)}%)`;
    } else {
      meta = `legacy: ${p.legacy_label}`;
    }
  }
  document.getElementById("current-meta").textContent = meta;
  document.querySelectorAll(".item").forEach(el => el.classList.toggle("active", parseInt(el.dataset.index) === i));
  const act = document.querySelector(".item.active");
  if (act) act.scrollIntoView({ block: "nearest" });
  updateGitAddBtn();
  render();
}

function updateGitAddBtn() {
  const btn = document.getElementById("git-add-btn");
  if (!serverMode) {
    btn.className = "git-add-btn offline";
    btn.textContent = "Git Add (server only)";
    btn.disabled = true;
    btn.title = "Run tests/utils/next-vs-legacy-server.py to enable staging";
    return;
  }
  const p = filtered[currentIndex];
  if (!p || !p.next_repo_path) {
    btn.className = "git-add-btn";
    btn.textContent = "Git Add";
    btn.disabled = true;
    return;
  }
  if (stagedRepoPaths.has(p.next_repo_path)) {
    btn.className = "git-add-btn staged";
    btn.textContent = "Staged";
    btn.disabled = true;
    return;
  }
  btn.className = "git-add-btn";
  btn.textContent = "Git Add";
  btn.disabled = false;
}

let toastTimer = null;
function showToast(message, isError) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.background = isError ? "#6c2025" : "#1b4332";
  toast.style.color = isError ? "#f8d7da" : "#b7e4c7";
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

async function gitAddCurrent() {
  if (!serverMode) return;
  const p = filtered[currentIndex];
  if (!p || !p.next_repo_path) return;
  const btn = document.getElementById("git-add-btn");
  btn.disabled = true;
  btn.textContent = "Adding...";
  try {
    const res = await fetch("/api/git-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [p.next_repo_path] }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "git add failed");
    stagedRepoPaths.add(p.next_repo_path);
    showToast("Staged " + p.next_repo_path, false);
    const oldIdentity = p.next_repo_path;
    buildSidebar();
    // Move to next un-staged entry; if we just hid the last one, fall back.
    if (filtered.length === 0) {
      currentIndex = -1;
      document.getElementById("compare-area").innerHTML = '<div class="empty">All visible pairs staged. Use Reset to start over.</div>';
      document.getElementById("current-title").textContent = "Nothing left";
      document.getElementById("current-meta").textContent = "";
      updateGitAddBtn();
      return;
    }
    const nextIdx = Math.min(currentIndex, filtered.length - 1);
    selectPair(Math.max(nextIdx, 0));
  } catch (err) {
    showToast(String(err.message || err), true);
    updateGitAddBtn();
  }
}

async function detectServer() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) throw new Error("non-200");
    const stagedRes = await fetch("/api/staged", { cache: "no-store" });
    const stagedJson = await stagedRes.json();
    if (stagedJson.ok && Array.isArray(stagedJson.staged)) {
      stagedJson.staged.forEach(s => stagedRepoPaths.add(s));
    }
    serverMode = true;
  } catch {
    serverMode = false;
  }
  buildSidebar();
  updateGitAddBtn();
}

function navigate(dir) {
  if (filtered.length === 0) return;
  let n = currentIndex + dir;
  if (n < 0) n = filtered.length - 1;
  if (n >= filtered.length) n = 0;
  selectPair(n);
}

function setMode(m) {
  mode = m;
  document.querySelectorAll(".mode-btns button").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
  document.getElementById("blink-controls").style.visibility = (m === "blink") ? "visible" : "hidden";
  if (currentIndex >= 0) render();
}

function stopBlink() { if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; } }

function render() {
  stopBlink();
  const area = document.getElementById("compare-area");
  const p = filtered[currentIndex];
  if (!p) { area.innerHTML = '<div class="empty">No selection.</div>'; return; }
  if (!p.legacy) {
    area.innerHTML = `
      <div class="single">
        <div class="panel-label">next-only baseline</div>
        <img src="${p.next}" />
      </div>`;
    return;
  }
  if (mode === "blink") {
    area.innerHTML = `
      <div class="blink-stack">
        <span class="blink-label" id="blink-label">NEXT</span>
        <img class="next" src="${p.next}" />
        <img class="actual" src="${p.legacy}" style="opacity:0" />
      </div>`;
    const legacyImg = area.querySelector("img.actual");
    const label = document.getElementById("blink-label");
    let showLegacy = false;
    blinkPaused = false;
    blinkTimer = setInterval(() => {
      if (blinkPaused) return;
      showLegacy = !showLegacy;
      legacyImg.style.opacity = showLegacy ? "1" : "0";
      label.textContent = showLegacy ? "LEGACY" : "NEXT";
      label.style.background = showLegacy ? "rgba(233,69,96,0.85)" : "rgba(15,52,96,0.85)";
    }, blinkSpeed);
  } else if (mode === "sbs") {
    area.innerHTML = `
      <div class="sbs">
        <div class="panel"><div class="panel-label">NEXT</div><div class="panel-meta">${p.next_label}</div><img src="${p.next}" /></div>
        <div class="panel"><div class="panel-label">LEGACY</div><div class="panel-meta">${p.legacy_label}</div><img src="${p.legacy}" /></div>
      </div>`;
  } else if (mode === "overlay") {
    area.innerHTML = `
      <div class="diff-wrap">
        <img src="${p.next}" />
        <img class="overlay" src="${p.legacy}" />
        <div class="diff-hint">mix-blend-mode: difference. Black = identical.</div>
      </div>`;
  } else if (mode === "diff") {
    if (!p.diff) {
      area.innerHTML = '<div class="empty">No diff image (size mismatch or build-time error).</div>';
      return;
    }
    area.innerHTML = `
      <div class="diff-wrap">
        <img src="${p.diff}" />
        <div class="diff-hint">Red = diverging pixels (>0.5% delta on any channel). Faded gray = identical to legacy.</div>
      </div>`;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); navigate(1); }
  else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); navigate(-1); }
  else if (e.key === "1") setMode("blink");
  else if (e.key === "2") setMode("sbs");
  else if (e.key === "3") setMode("overlay");
  else if (e.key === "4") setMode("diff");
  else if (e.key === " ") { e.preventDefault(); blinkPaused = !blinkPaused; }
  else if (e.key === "a" || e.key === "A") { e.preventDefault(); gitAddCurrent(); }
  else if (e.key === "/") { e.preventDefault(); document.getElementById("filter").focus(); }
  else if (e.key === "Escape") document.getElementById("filter").blur();
});

["filter-all", "filter-paired", "filter-next-only"].forEach(id => {
  document.getElementById(id).onclick = () => {
    pairFilter = id.replace("filter-", "");
    ["filter-all", "filter-paired", "filter-next-only"].forEach(x => document.getElementById(x).classList.toggle("active", x === id));
    buildSidebar();
  };
});

document.getElementById("filter").addEventListener("input", () => {
  buildSidebar();
});

const speedInput = document.getElementById("blink-speed");
speedInput.oninput = () => {
  blinkSpeed = parseInt(speedInput.value, 10);
  document.getElementById("blink-speed-label").textContent = blinkSpeed + "ms";
  if (mode === "blink" && currentIndex >= 0) render();
};

buildSidebar();
if (filtered.length > 0) selectPair(0);
detectServer();
</script>
</body>
</html>
"""


def main() -> None:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    entries: list[dict] = []
    for spec_dir in sorted(NEXT_ROOT.iterdir()):
        if not spec_dir.is_dir():
            continue
        spec_name = spec_dir.name
        for next_file in sorted(spec_dir.glob("*.png")):
            legacy = find_legacy_match(spec_name, next_file)
            spec_out = OUT_DIR / spec_name
            spec_out.mkdir(parents=True, exist_ok=True)
            next_out = spec_out / f"{next_file.stem}-next.png"
            shutil.copyfile(next_file, next_out)
            # Repo-relative path of the actual next-side baseline so the
            # server's /git-add can stage it without us having to recompute
            # the mapping client-side.
            next_repo_path = next_file.relative_to(REPO).as_posix()
            entry = {
                "spec": spec_name.replace(".spec.ts", ""),
                "name": next_file.stem,
                "next": str(next_out.relative_to(OUT_DIR.parent)),
                "next_label": str(next_file.relative_to(TESTS)),
                "next_repo_path": next_repo_path,
                "legacy": None,
                "legacy_label": None,
            }
            if legacy:
                legacy_out = spec_out / f"{next_file.stem}-legacy.png"
                shutil.copyfile(legacy, legacy_out)
                entry["legacy"] = str(legacy_out.relative_to(OUT_DIR.parent))
                entry["legacy_label"] = str(legacy.relative_to(TESTS))
                diff_out = spec_out / f"{next_file.stem}-diff.png"
                stats = compute_diff(next_file, legacy, diff_out)
                entry["diff"] = str(diff_out.relative_to(OUT_DIR.parent))
                entry["diff_stats"] = stats
            entries.append(entry)

    # Sort: paired-with-largest-diff first, then next-only, then identical paired.
    def sort_key(e: dict) -> tuple[int, float, str, str]:
        if not e.get("legacy"):
            return (2, 0.0, e["spec"], e["name"])
        ratio = float(e["diff_stats"]["ratio"])
        # Group: 0 = paired with diff, 1 = identical
        group = 1 if ratio == 0 else 0
        return (group, -ratio, e["spec"], e["name"])

    entries.sort(key=sort_key)

    paired = sum(1 for e in entries if e["legacy"])
    print(f"Wrote {len(entries)} entries ({paired} paired with legacy, {len(entries) - paired} next-only)")

    html = HTML_TEMPLATE.replace("__MANIFEST__", json.dumps(entries, indent=2))
    OUT_HTML.write_text(html)
    print(f"HTML: {OUT_HTML.relative_to(REPO)}")
    print(f"Open: file://{OUT_HTML}")


if __name__ == "__main__":
    main()
