"""화면 캡처에 번호 마커(원 숫자 + 영역 윤곽)를 그린다.

입력: capture_screens.mjs 가 만든 PNG 와 rects.json (DOM 에서 읽은 영역 좌표)
출력: <출력 폴더>/<이름>.png (마커 포함), <출력 폴더>/raw/<이름>.png (원본)
사용: python annotate_screens.py <캡처 폴더> <출력 폴더>

배지 위치 규칙
  - 기본: 영역 좌상단 모서리 바깥쪽에 걸친다(제목 글자를 가리지 않도록).
  - 좌측 도크처럼 왼쪽에 여백이 없으면 우상단 모서리 바깥쪽을 쓴다.
  - ANCHORS 에 (화면, 셀렉터) 별 비율 위치 [fx, fy] 를 두면 그 위치(영역 안 비율)를 우선한다.
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
(OUT / "raw").mkdir(parents=True, exist_ok=True)

ORANGE = (255, 122, 0)
RADIUS = 26
FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 30)

# (셀렉터) → [fx, fy] : 영역 안 비율 위치에 배지 중심을 둔다. 3D 영역·가운데 비어 있는 곳 등에 사용.
ANCHORS = {
    ".viewer-main": [0.035, 0.5],
    ".global-nav": [0.28, 1.0],
    ".time-controls": [0.5, 0.0],
    ".view-mode-toggle": [-0.35, 0.5],
    ".alert-sop-page__grade-stack": [1.0, 0.0],
    ".fluid-field-legend": [1.0, 0.0],
    ".viewer-toast": [1.0, 0.0],
    ".pier-timeline-panel__gantt": [1.0, 0.0],
    ".pier-timeline-panel__reach": [1.0, 0.0],
    ".risk-judgment-panel__cards": [1.0, 0.0],
    ".pipeline-kpi": [1.0, 0.0],
    ".cfd-frame-readout": [0.5, 0.0],
    ".axis-triad": [0.5, 0.0],
    ".cfd-velocity-colorbar": [0.5, 0.0],
    ".section-profile-panel__chart": [0.5, 0.0],
    ".risk-judgment-panel__summary": [1.0, 0.0],
    ".pipeline-stage-strip": [0.5, 0.0],
    ".case-bi-strip": [0.5, 0.0],
    ".mgmt-pager": [0.5, 0.0],
    ".data-pipeline__pager": [0.5, 0.0],
    ".login-screen__submit": [1.0, 0.5],
}

rects = json.loads((SRC / "rects.json").read_text(encoding="utf-8"))


def overlaps(a, b, pad=4):
    return not (a[2] + pad < b[0] or b[2] + pad < a[0] or a[3] + pad < b[1] or b[3] + pad < a[1])


def center_for(sel, r, size):
    x0, y0, x1, y1 = r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]
    if sel in ANCHORS:
        fx, fy = ANCHORS[sel]
        return x0 + fx * r["w"], y0 + fy * r["h"]
    cx, cy = x0 - 8, y0 - 8
    if cx < RADIUS + 2:  # 왼쪽 여백이 없으면 우상단 모서리 바깥쪽
        cx = x1 + 8
    return cx, cy


for name, items in rects.items():
    png = SRC / f"{name}.png"
    shutil.copy(png, OUT / "raw" / f"{name}.png")
    img = Image.open(png).convert("RGB")
    W, H = img.size
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for it in items:
        r = it["rect"]
        if r and it["outline"]:
            d.rectangle([r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]], outline=ORANGE + (235,), width=4)
    placed = []
    for it in items:
        r = it["rect"]
        if not r:
            continue
        cx, cy = center_for(it["sel"], r, (W, H))
        cx = min(max(cx, RADIUS + 2), W - RADIUS - 2)
        cy = min(max(cy, RADIUS + 2), H - RADIUS - 2)
        box = (cx - RADIUS, cy - RADIUS, cx + RADIUS, cy + RADIUS)
        guard = 0
        while any(overlaps(box, p) for p in placed) and guard < 40:
            cx += RADIUS * 2 + 6
            cx = min(cx, W - RADIUS - 2)
            box = (cx - RADIUS, cy - RADIUS, cx + RADIUS, cy + RADIUS)
            guard += 1
        placed.append(box)
        d.ellipse(box, fill=ORANGE + (255,), outline=(255, 255, 255, 255), width=4)
        text = str(it["n"])
        tw = d.textlength(text, font=FONT)
        d.text((cx - tw / 2, cy - 19), text, font=FONT, fill=(255, 255, 255, 255))
    out = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    out.save(OUT / f"{name}.png", optimize=True)
    print("annotated", name, len(placed), "markers")
