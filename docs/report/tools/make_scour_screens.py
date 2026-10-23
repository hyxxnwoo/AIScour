"""세굴·퇴적 확인 화면(수면 숨김)에 설명 표식을 넣고, 퇴적 스케일 ×1 / ×4 비교 이미지를 만든다.

입력: capture_scour_screens.mjs 가 만든 x_obl_x4.png, x_obl_x1.png (1920×1200 앱 화면)
출력: <출력 폴더>/s05b_scour_deposit.png, s05c_scale_compare.png
사용: python make_scour_screens.py <캡처 폴더> <출력 폴더>
"""
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "raw").mkdir(exist_ok=True)

ORANGE = (255, 122, 0)
RED = (214, 40, 57)
BLUE = (33, 102, 172)
FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 30)
FONT_S = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 26)
R = 26


def badge(d, cx, cy, n, color=ORANGE):
    d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=color + (255,), outline=(255, 255, 255, 255), width=4)
    tw = d.textlength(str(n), font=FONT)
    d.text((cx - tw / 2, cy - 19), str(n), font=FONT, fill=(255, 255, 255, 255))


def ring(d, cx, cy, rx, ry, color, width=5):
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=color + (255,), width=width)


# ── 1. 표식 이미지 ───────────────────────────────────────────────
shutil.copy(SRC / "x_obl_x4.png", OUT / "raw" / "s05b_scour_deposit.png")
img = Image.open(SRC / "x_obl_x4.png").convert("RGBA")
ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)

# 3D 장면 위: 세굴 구덩이(교각 기초 주변, 적색 원) / 퇴적 둔덕(교각 하류측, 청색 원)
pits = [(745, 770, 105, 62), (950, 668, 100, 55), (1085, 598, 85, 45)]
mounds = [(965, 745, 130, 38), (1145, 640, 105, 36)]
for cx, cy, rx, ry in pits:
    ring(d, cx, cy, rx, ry, RED)
for cx, cy, rx, ry in mounds:
    ring(d, cx, cy, rx, ry, BLUE)
badge(d, 628, 770, 1, RED)
badge(d, 1075, 520, 1, RED)
badge(d, 1030, 790, 2, BLUE)
badge(d, 1265, 640, 2, BLUE)

# 화면 컨트롤: 퇴적 스케일, 수면 체크, 범례
for (x0, y0, x1, y1), n in [((10, 244, 302, 272), 3), ((10, 402, 302, 424), 4), ((800, 108, 1100, 256), 5), ((1590, 506, 1912, 640), 6)]:
    d.rectangle((x0, y0, x1, y1), outline=ORANGE + (255,), width=4)
    badge(d, x0 + (6 if x0 > 300 else 306), y0 - 2 if y0 < 250 else y0 + 4, n)
out = Image.alpha_composite(img, ov).convert("RGB")
out.save(OUT / "s05b_scour_deposit.png", optimize=True)
print("saved s05b_scour_deposit.png")

# ── 2. ×1 / ×4 비교 ──────────────────────────────────────────────
box = (330, 330, 1330, 860)
a = Image.open(SRC / "x_obl_x1.png").convert("RGB").crop(box)
b = Image.open(SRC / "x_obl_x4.png").convert("RGB").crop(box)
w, h = a.size
canvas = Image.new("RGB", (w * 2 + 14, h), "white")
canvas.paste(a, (0, 0))
canvas.paste(b, (w + 14, 0))
dd = ImageDraw.Draw(canvas)
for x, text in [(14, "퇴적 스케일 ×1 (실제 비율)"), (w + 28, "퇴적 스케일 ×4 (높이 4배 과장)")]:
    dd.rounded_rectangle((x - 6, 10, x + dd.textlength(text, font=FONT_S) + 14, 54), radius=8, fill=(12, 32, 52))
    dd.text((x + 4, 14), text, font=FONT_S, fill=(255, 255, 255))
canvas.save(OUT / "s05c_scale_compare.png", optimize=True)
print("saved s05c_scale_compare.png")
