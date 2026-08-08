"""Image folder scanning and metadata parsing."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
PACKAGES_PATH = ROOT / "packages.json"
IMAGE_PATTERN = re.compile(r"^soft(\d)_elegant(\d)_(\d+)_([\d.]+)_img_(.+)\.png$")

DEFAULT_CONFIG = {
    "raterId": "dev",
    "raterLabel": "Development",
    "imageDir": "result_ML_my200_nobgfull",
    "accessCode": "",
}


def load_config() -> dict:
    if CONFIG_PATH.is_file():
        with CONFIG_PATH.open(encoding="utf-8") as f:
            cfg = json.load(f)
        for key, value in DEFAULT_CONFIG.items():
            cfg.setdefault(key, value)
        return cfg
    return dict(DEFAULT_CONFIG)


def load_packages() -> List[Dict[str, Any]]:
    if not PACKAGES_PATH.is_file():
        return []
    with PACKAGES_PATH.open(encoding="utf-8") as f:
        return json.load(f).get("packages", [])


def get_package(package_id: str) -> Optional[Dict[str, Any]]:
    for pkg in load_packages():
        if pkg.get("id") == package_id:
            return pkg
    return None


def resolve_image_dir(cfg: dict) -> Path:
    path = Path(cfg["imageDir"])
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def resolve_package_image_dir(pkg: Dict[str, Any]) -> Path:
    path = Path(pkg["image_dir"])
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def scan_images(image_dir: Path) -> List[Dict[str, Any]]:
    images: List[Dict[str, Any]] = []
    if not image_dir.is_dir():
        return images

    for file in sorted(image_dir.iterdir()):
        if not file.is_file():
            continue
        match = IMAGE_PATTERN.match(file.name)
        if not match:
            continue
        soft = int(match.group(1))
        elegant = int(match.group(2))
        rank = int(match.group(3))
        similarity = float(match.group(4))
        images.append(
            {
                "fileName": file.name,
                "label": f"soft{soft}_elegant{elegant}",
                "soft": soft,
                "elegant": elegant,
                "rank": rank,
                "similarity": similarity,
            }
        )

    images.sort(key=lambda x: (x["soft"], x["elegant"], x["rank"]))
    return images


def axis_meta(images: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not images:
        return {"softValues": [], "elegantValues": [], "labels": []}

    soft_values = sorted({img["soft"] for img in images})
    elegant_values = sorted({img["elegant"] for img in images})
    labels = sorted({img["label"] for img in images})
    label_counts: Dict[str, int] = {}
    for img in images:
        label_counts[img["label"]] = label_counts.get(img["label"], 0) + 1

    return {
        "softValues": soft_values,
        "elegantValues": elegant_values,
        "labels": labels,
        "labelCounts": label_counts,
        "totalImages": len(images),
    }
