#!/usr/bin/env python3
"""Generate the four static check sites for GitHub Pages."""

import json
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from catalog import axis_meta, scan_images

ROOT = Path(__file__).resolve().parent
PACKAGES_PATH = ROOT / "packages.json"
SITE_TEMPLATE = ROOT / "site.html"
SITES_PATH = ROOT / "check-sites"


def main() -> None:
    packages = json.loads(PACKAGES_PATH.read_text(encoding="utf-8"))["packages"]

    for package in packages:
        package_id = package["id"]
        image_dir = ROOT / package["image_dir"]
        if not image_dir.is_dir():
            raise SystemExit(f"画像フォルダがありません: {image_dir}")

        images = scan_images(image_dir)
        if not images:
            raise SystemExit(f"有効な画像がありません: {image_dir}")

        for image in images:
            image["path"] = f"../../{package['image_dir']}/{image['fileName']}"

        output_dir = SITES_PATH / package_id
        output_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SITE_TEMPLATE, output_dir / "index.html")

        config = {
            "raterId": package_id,
            "raterLabel": package.get("label", package_id),
            "packageId": package_id,
            "packageLabel": package.get("label", package_id),
        }
        (output_dir / "config.json").write_text(
            json.dumps(config, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        (output_dir / "images.json").write_text(
            json.dumps(
                {"images": images, "meta": axis_meta(images)},
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )

        required_files = (
            output_dir / "index.html",
            output_dir / "config.json",
            output_dir / "images.json",
            ROOT / "app.js",
            ROOT / "style.css",
            image_dir / images[0]["fileName"],
        )
        missing = [str(path) for path in required_files if not path.is_file()]
        if missing:
            raise SystemExit("生成後のファイル確認に失敗しました:\n" + "\n".join(missing))

        print(f"{package_id}: {len(images)} images")


if __name__ == "__main__":
    main()
