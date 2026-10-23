"""세굴·퇴적 분포 그림 생성.

입력: scourdump.json — 앱이 CSV 에서 만든 하상 변화(ScourSeries, 1 cm 격자, 교각 주변 표시 범위 적용)와
      교각 위치·교각별 세굴심을 vitest 로 덤프한 것(앱 화면과 같은 값).
출력: <출력 폴더>/fig_scour_map.png, fig_scour_time.png, fig_scour_profile.png
사용: python make_scour_figures.py <scourdump.json> <출력 폴더>
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Circle, FancyArrowPatch, Rectangle

plt.rcParams["font.family"] = "Malgun Gothic"
plt.rcParams["axes.unicode_minus"] = False

DUMP, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
d = json.loads(DUMP.read_text(encoding="utf-8"))
W, H, CS = d["width"], d["height"], d["cellSize"]
HALF_X, HALF_Z = (W - 1) * CS / 2, (H - 1) * CS / 2
X = np.linspace(-HALF_X, HALF_X, W)
Z = np.linspace(-HALF_Z, HALF_Z, H)
PIERS = d["piers"]
R_SHAFT = PIERS[0]["diameter"] / 2
FOOT = PIERS[0]["footing"]

# 앱 CFD 모드와 같은 적-백-청(세굴 적색, 퇴적 청색)
STOPS = [(-1.0, (178, 24, 43)), (-0.5, (239, 138, 98)), (0.0, (255, 255, 255)), (0.5, (103, 169, 207)), (1.0, (33, 102, 172))]
CMAP = LinearSegmentedColormap.from_list("rwb", [((t + 1) / 2, tuple(c / 255 for c in rgb)) for t, rgb in STOPS])

VMAX = 0.09  # 세 시점에 같은 색 범위를 써서 진행을 비교할 수 있게 한다(m)


def frame(t):
    v = d["times"][str(t)]
    return np.array(v["delta"], dtype=float).reshape(H, W), v


def draw_piers(ax, lw=1.0):
    for p in PIERS:
        ax.add_patch(Rectangle((p["x"] - FOOT["lengthX"] / 2, p["z"] - FOOT["widthZ"] / 2), FOOT["lengthX"], FOOT["widthZ"],
                               fc="#B9C2CC", ec="#3C4752", lw=lw, alpha=0.30, zorder=5))
        ax.add_patch(Circle((p["x"], p["z"]), R_SHAFT, fc="#8C6D1F", ec="#3C4752", lw=lw, alpha=0.95, zorder=6))
        ax.text(p["x"] + FOOT["lengthX"] / 2 + 0.012, p["z"] + FOOT["widthZ"] / 2 + 0.012, p["id"], fontsize=10, fontweight="bold",
                color="#222", zorder=7)


def contours(ax, f, labels=True):
    ero = [-0.08, -0.06, -0.04, -0.02]
    dep = [0.005, 0.010]
    cs1 = ax.contour(X, Z, f, levels=ero, colors="#7A1220", linewidths=0.8, zorder=3)
    cs2 = ax.contour(X, Z, f, levels=dep, colors="#16487A", linewidths=0.8, zorder=3)
    if labels:
        ax.clabel(cs1, fmt=lambda v: f"{v*1000:.0f}", fontsize=7, inline=True)
        ax.clabel(cs2, fmt=lambda v: f"+{v*1000:.0f}", fontsize=7, inline=True)


def view(ax, f, title, crop=True):
    ax.set_facecolor("#F4F4F4")
    im = ax.pcolormesh(X, Z, np.clip(f, -VMAX, VMAX), cmap=CMAP, vmin=-VMAX, vmax=VMAX, shading="auto", zorder=1)
    contours(ax, f)
    draw_piers(ax)
    if crop:
        ax.set_xlim(-0.3, 0.65)
        ax.set_ylim(-0.52, 0.52)
    ax.set_aspect("equal")
    ax.set_title(title, fontsize=11, loc="left", fontweight="bold")
    return im


# ── 1. 분포도(t = 1800 s) ─────────────────────────────────────────
f, v = frame(1800)
fig, ax = plt.subplots(figsize=(10.2, 6.2))
im = view(ax, f, f"하상 변화 분포도 (t = {v['t']:.0f} s)")
ax.set_xlabel("X 흐름 방향 (m)")
ax.set_ylabel("Y 횡단 방향 (m)")
ax.add_patch(FancyArrowPatch((-0.27, 0.43), (-0.11, 0.43), arrowstyle="-|>", mutation_scale=18, color="#222", lw=2, zorder=8))
ax.text(-0.27, 0.455, "흐름 방향", fontsize=10.5, fontweight="bold", color="#222", zorder=8)
mn = v["minAt"]
ax.annotate("세굴(깎임)\n교각 주변에 깊은 구덩이\n(P1이 가장 깊음)", xy=(-0.075, -0.34), xytext=(-0.28, -0.46), fontsize=10, fontweight="bold",
            color="#7A1220", arrowprops=dict(arrowstyle="->", color="#7A1220", lw=1.6), zorder=9,
            bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="#7A1220", lw=1))
ax.annotate("퇴적(쌓임)\n교각 하류측에 낮은 둔덕", xy=(0.27, -0.27), xytext=(0.26, -0.46), fontsize=10, fontweight="bold",
            color="#16487A", arrowprops=dict(arrowstyle="->", color="#16487A", lw=1.6), zorder=9,
            bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="#16487A", lw=1))
cb = fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
cb.set_label("하상 변화량 (m)   ← 세굴 / 퇴적 →")
fig.text(0.5, -0.015, "등고선: 세굴 -20/-40/-60/-80 mm(적색 점선), 퇴적 +5/+10 mm(청색 실선) · 색 범위 ±0.09 m 고정 · 회색 사각형은 하단부, 원은 기둥",
         ha="center", fontsize=8.5, color="#333")
fig.tight_layout()
fig.savefig(OUT / "fig_scour_map.png", dpi=200, bbox_inches="tight", facecolor="white")
plt.close(fig)
print("saved fig_scour_map.png")

# ── 2. 시간별 진행 ────────────────────────────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(12.6, 4.3), sharey=True)
for ax, t in zip(axes, [300, 900, 1800]):
    f, v = frame(t)
    im = view(ax, f, f"t = {v['t']:.0f} s")
    ax.set_xlabel("X 흐름 (m)")
axes[0].set_ylabel("Y 횡단 (m)")
fig.subplots_adjust(right=0.9, wspace=0.06)
cax = fig.add_axes([0.915, 0.18, 0.012, 0.64])
cb = fig.colorbar(im, cax=cax)
cb.set_label("하상 변화량 (m)")
fig.savefig(OUT / "fig_scour_time.png", dpi=200, bbox_inches="tight", facecolor="white")
plt.close(fig)
print("saved fig_scour_time.png")

# ── 3. 교각 중심선 종단 프로파일(흐름 방향) ─────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(12.6, 3.9), sharey=True)
colors = {"300": "#9AA7B5", "900": "#E8791A", "1800": "#B2182B"}
for ax, p in zip(axes, PIERS):
    row = int(round((p["z"] + HALF_Z) / CS))
    for t in [300, 900, 1800]:
        f, v = frame(t)
        prof = f[row, :]
        ax.plot(X, prof * 1000, color=colors[str(t)], lw=1.8, label=f"t = {v['t']:.0f} s")
        if t == 1800:
            ax.fill_between(X, prof * 1000, 0, where=prof < 0, color="#EF8A62", alpha=0.45, lw=0)
            ax.fill_between(X, prof * 1000, 0, where=prof > 0, color="#67A9CF", alpha=0.55, lw=0)
    ax.axhline(0, color="#333", lw=0.8)
    ax.axvspan(p["x"] - FOOT["lengthX"] / 2, p["x"] + FOOT["lengthX"] / 2, color="#B9C2CC", alpha=0.55, lw=0)
    ax.set_xlim(-0.3, 0.65)
    ax.set_title(f"{p['id']} 중심선 (Y = {p['z']:+.2f} m)", fontsize=10.5, loc="left", fontweight="bold")
    ax.set_xlabel("X 흐름 (m)")
    ax.grid(alpha=0.25)
axes[0].set_ylabel("하상 변화 (mm)  ·  (-) 세굴 / (+) 퇴적")
axes[0].legend(fontsize=8.5, loc="lower right")
fig.tight_layout()
fig.savefig(OUT / "fig_scour_profile.png", dpi=200, bbox_inches="tight", facecolor="white")
plt.close(fig)
print("saved fig_scour_profile.png")

# ── 4. 수치 요약(문서 표용) ──────────────────────────────────────
summary = {}
for t in [300, 900, 1800]:
    f, v = frame(t)
    summary[str(t)] = {
        "t": v["t"],
        "min": float(f.min()),
        "max": float(f.max()),
        "piers": {x["pierId"]: x["scourDepthM"] for x in v["depths"]},
        "minAt": [float(X[v["minAt"][0]]), float(Z[v["minAt"][1]])],
        "maxAt": [float(X[v["maxAt"][0]]), float(Z[v["maxAt"][1]])],
    }
(OUT / "scour_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
