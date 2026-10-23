"""단계보고서용 그림 생성 스크립트.

입력
  - flowdump.json : SyntheticCfdFlow 의 실제 출력(vitest 로 덤프). 평면(수심 중간)·교각 전면 종단면 속도장.
  - shots*/*.png  : 헤드리스 Chrome 으로 캡처한 앱 화면(capture_cfd_screens.mjs).
출력
  - docs/report/figures/*.png
사용: python make_figures.py <flowdump.json> <shots 상위 폴더> <출력 폴더>
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Rectangle
from PIL import Image

plt.rcParams["font.family"] = "Malgun Gothic"
plt.rcParams["axes.unicode_minus"] = False

DUMP, SHOTS, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)

# ── 앱 컬러맵 정의(src/utils/*.ts 와 동일한 stop) ─────────────────────────
BASIC_STOPS = [(-1.0, (12, 36, 86)), (-0.5, (50, 110, 168)), (-0.15, (122, 178, 211)),
               (0.0, (214, 178, 118)), (0.35, (168, 118, 62)), (1.0, (92, 62, 26))]
CFD_SCOUR = [(-1.0, (178, 24, 43)), (-0.5, (239, 138, 98)), (0.0, (255, 255, 255)),
             (0.5, (103, 169, 207)), (1.0, (33, 102, 172))]
VELOCITY = [(0.0, (68, 1, 84)), (0.25, (59, 82, 139)), (0.5, (33, 144, 140)),
            (0.75, (93, 200, 99)), (1.0, (200, 224, 32))]
GRADES = [("관심", "#2E7DD1"), ("주의", "#E8B21A"), ("경계", "#E8791A"), ("심각", "#D02B2B")]


def cmap(stops, lo, hi):
    return LinearSegmentedColormap.from_list(
        "c", [((t - lo) / (hi - lo), tuple(c / 255 for c in rgb)) for t, rgb in stops])


VEL_CMAP = cmap(VELOCITY, 0, 1)


def save(fig, name, dpi=200):
    fig.savefig(OUT / name, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("saved", name)


# ── 그림: 시스템 구성도 ───────────────────────────────────────────────
def fig_architecture():
    fig, ax = plt.subplots(figsize=(11, 6.6))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6.6)
    ax.axis("off")
    layers = [
        ("입력 데이터", 5.55, "#E8EEF5", ["CFD 결과 CSV\n(하상 변화 scrdif 시계열)", "해석 유속 u·v·w\n(데이터 확보 시)", "조건 설정\n(유속·수심·교각 형상)"]),
        ("상태·모델", 4.05, "#DFF1EC", ["viewState\n보기 모드(기본/CFD)\n브라우저 저장", "cfdLayers\n레이어 on/off\n밀도·투명도·단면 위치", "CfdFlowSource\n합성 유동장 ↔ 해석 데이터\n자동 전환", "flowSolids\n기둥·하단부 고체 모델"]),
        ("3D 렌더 모듈 (Three.js)", 2.55, "#FFF3D9", ["Terrain\n하상 컬러·등심선·메시", "TerrainWater\n자유수면 교란", "CfdPathlines\n유선(입자 추적)", "CfdVectorGlyphs\n벡터 글리프", "CfdCutPlane\n연직 단면"]),
        ("사용자 인터페이스", 1.05, "#F3E6F5", ["[기본|CFD] 토글", "레이어 패널", "컬러바 2종", "t·Frame 오버레이\n좌표축", "클릭 프로브"]),
    ]
    boxes = {}
    for title, y, color, items in layers:
        ax.add_patch(FancyBboxPatch((0.15, y - 0.55), 10.7, 1.2, boxstyle="round,pad=0.02,rounding_size=0.08",
                                    fc=color, ec="#9AA7B5", lw=1))
        ax.text(0.3, y + 0.5, title, fontsize=10, fontweight="bold", va="center", color="#2B3A4A")
        n = len(items)
        w = 10.2 / n
        for i, it in enumerate(items):
            x0 = 0.4 + i * w
            ax.add_patch(FancyBboxPatch((x0, y - 0.45), w - 0.15, 0.82, boxstyle="round,pad=0.02,rounding_size=0.05",
                                        fc="white", ec="#6B7C8F", lw=0.8))
            ax.text(x0 + (w - 0.15) / 2, y - 0.04, it, ha="center", va="center", fontsize=8.3, linespacing=1.25)
        boxes[title] = y
    ys = [5.55, 4.05, 2.55, 1.05]
    for a, b in zip(ys[:-1], ys[1:]):
        ax.add_patch(FancyArrowPatch((5.5, a - 0.58), (5.5, b + 0.68), arrowstyle="-|>", mutation_scale=14, color="#445566", lw=1.4))
    ax.text(5.65, 3.32, "t (타임라인 시각)", fontsize=8, color="#445566", va="center")
    ax.text(5.65, 4.8, "데이터 유무 판단", fontsize=8, color="#445566", va="center")
    ax.text(5.65, 1.82, "사용자 조작", fontsize=8, color="#445566", va="center")
    save(fig, "fig_architecture.png")


# ── 그림: 컬러맵 ────────────────────────────────────────────────────
def fig_colormaps():
    fig, axes = plt.subplots(3, 1, figsize=(8.4, 3.9), gridspec_kw={"height_ratios": [1, 1, 1]})
    grad = np.linspace(0, 1, 512)[None, :]
    items = [
        ("기본 모드 — 하상 변화(모래색)", cmap(BASIC_STOPS, -1, 1), ["-최대 세굴", "0", "+최대 퇴적"]),
        ("CFD 모드 — 하상 변화(세굴 적색 / 0 흰색 / 퇴적 청색)", cmap(CFD_SCOUR, -1, 1), ["-최대 세굴", "0", "+최대 퇴적"]),
        ("CFD 모드 — 유속 (m/s, 별도 순차형)", VEL_CMAP, ["0", "", "최대"]),
    ]
    for ax, (title, cm, labs) in zip(axes, items):
        ax.imshow(grad, aspect="auto", cmap=cm, extent=[0, 1, 0, 1])
        ax.set_yticks([])
        ax.set_xticks([0, 0.5, 1])
        ax.set_xticklabels(labs, fontsize=8)
        ax.set_title(title, fontsize=9, loc="left", pad=3)
    fig.tight_layout()
    save(fig, "fig_colormaps.png")

    fig, ax = plt.subplots(figsize=(8.4, 1.0))
    ax.set_xlim(0, 4)
    ax.set_ylim(0, 1)
    ax.axis("off")
    for i, (name, col) in enumerate(GRADES):
        ax.add_patch(Rectangle((i + 0.03, 0.12), 0.94, 0.62, fc=col, ec="none"))
        ax.text(i + 0.5, 0.43, f"{name}  {col}", ha="center", va="center", color="white", fontsize=9, fontweight="bold")
    ax.text(0, 0.92, "위험 등급 4색(고정) — 유속 컬러맵과 겹치지 않도록 RGB 거리 35 이상 확보", fontsize=8.5, va="center")
    save(fig, "fig_grade_colors.png")


# ── 그림: 합성 유동장 출력 ─────────────────────────────────────────────
def load_dump():
    d = json.loads(DUMP.read_text(encoding="utf-8"))

    def arr(rows):
        return np.array([[np.nan if v is None else v for v in r] for r in rows], dtype=float)

    return d, arr


def draw_solids(ax, d, lw=1.2):
    R = d["R"]
    f = d["footing"]
    for x, z in d["piers"]:
        ax.add_patch(Rectangle((x - f["lengthX"] / 2, z - f["widthZ"] / 2), f["lengthX"], f["widthZ"],
                               fc="#B9C2CC", ec="#3C4752", lw=lw, zorder=5))
        ax.add_patch(Circle((x, z), R, fc="#8C6D1F", ec="#3C4752", lw=lw, zorder=6))


def fig_flow_plan():
    d, arr = load_dump()
    p = d["plan"]["4"]
    xs, zs = np.array(p["xs"]), np.array(p["zs"])
    vx, vz = arr(p["vx"]), arr(p["vz"])
    speed = np.hypot(vx, vz)
    X, Z = np.meshgrid(xs, zs)
    dz, dx = zs[1] - zs[0], xs[1] - xs[0]
    vxf, vzf = np.nan_to_num(vx), np.nan_to_num(vz)
    omega = np.gradient(vxf, dz, axis=0) - np.gradient(vzf, dx, axis=1)
    omega[np.isnan(vx)] = np.nan

    fig, axes = plt.subplots(1, 2, figsize=(11.2, 5.0), sharey=True)
    ax = axes[0]
    im = ax.pcolormesh(X, Z, speed, cmap=VEL_CMAP, vmin=0, vmax=0.4, shading="auto")
    seeds = np.array([[xs[0] + 1e-3, z] for z in np.linspace(zs[0] + 0.01, zs[-1] - 0.01, 46)])
    ax.streamplot(xs, zs, np.ma.masked_invalid(vx), np.ma.masked_invalid(vz), color="white", linewidth=0.7,
                  arrowsize=0.7, start_points=seeds, integration_direction="forward", broken_streamlines=False)
    draw_solids(ax, d)
    ax.set_ylabel("Y 횡단 (m)")
    ax.set_xlabel("X 흐름 (m)")
    ax.set_title("(a) 유속 크기와 유선", fontsize=10.5, loc="left")
    ax.set_aspect("equal")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.02, label="유속 (m/s)")

    ax = axes[1]
    lim = 25
    im2 = ax.pcolormesh(X, Z, omega, cmap="RdBu_r", vmin=-lim, vmax=lim, shading="auto")
    draw_solids(ax, d)
    ax.set_xlabel("X 흐름 (m)")
    ax.set_title("(b) 연직 와도 (카르만 와류열)", fontsize=10.5, loc="left")
    ax.set_aspect("equal")
    fig.colorbar(im2, ax=ax, fraction=0.046, pad=0.02, label="와도 (1/s)")
    fig.tight_layout()
    save(fig, "fig_flow_plan.png")

    # 시간 경과: 와류가 하류로 이동
    fig, axes = plt.subplots(1, 3, figsize=(11.4, 4.1), sharey=True)
    for ax, key in zip(axes, ["4", "4.3125", "4.625"]):
        q = d["plan"][key]
        vxq, vzq = arr(q["vx"]), arr(q["vz"])
        vxn, vzn = np.nan_to_num(vxq), np.nan_to_num(vzq)
        om = np.gradient(vxn, dz, axis=0) - np.gradient(vzn, dx, axis=1)
        om[np.isnan(vxq)] = np.nan
        ax.pcolormesh(X, Z, om, cmap="RdBu_r", vmin=-lim, vmax=lim, shading="auto")
        draw_solids(ax, d, lw=0.9)
        ax.set_aspect("equal")
        ax.set_xlabel("X 흐름 (m)")
        ax.set_title(f"t = {float(key):.3f} s", fontsize=10.5, loc="left")
    axes[0].set_ylabel("Y 횡단 (m)")
    fig.tight_layout()
    save(fig, "fig_vortex_time.png")


def fig_flow_vertical():
    d, arr = load_dump()
    v = d["vert"]
    xs, ys = np.array(v["xs"]), np.array(v["ys"])
    vx, vy = arr(v["vx"]), arr(v["vy"])
    speed = np.hypot(vx, vy)
    X, Y = np.meshgrid(xs, ys)
    fig, ax = plt.subplots(figsize=(8.6, 3.7))
    im = ax.pcolormesh(X, Y, speed, cmap=VEL_CMAP, vmin=0, vmax=0.4, shading="auto")
    seeds = [[xs[0] + 1e-3, y] for y in np.linspace(0.004, 0.146, 26)]
    seeds += [[x, y] for x in (-0.15, -0.12, -0.10, -0.085) for y in (0.004, 0.012, 0.022, 0.034, 0.044)]
    ax.streamplot(xs, ys, np.ma.masked_invalid(vx), np.ma.masked_invalid(vy), color="white", linewidth=0.8,
                  arrowsize=0.8, start_points=np.array(seeds), integration_direction="both", broken_streamlines=False,
                  maxlength=4)
    f = d["footing"]
    ax.add_patch(Rectangle((-f["lengthX"] / 2, 0), f["lengthX"], f["height"], fc="#B9C2CC", ec="#3C4752", lw=1.0, zorder=5))
    ax.add_patch(Rectangle((-d["R"], f["height"]), 2 * d["R"], 0.15 - f["height"], fc="#8C6D1F", ec="#3C4752", lw=1.0, zorder=6))
    ax.set_xlabel("X 흐름 (m)")
    ax.set_ylabel("연직 (m)")
    ax.set_title("교각 전면 종단면(중심선) — 하강류와 하상 부근 말굽와류", fontsize=10, loc="left")
    ax.set_xlim(xs[0], xs[-1])
    ax.set_ylim(0, 0.15)
    fig.colorbar(im, ax=ax, fraction=0.025, pad=0.01, label="유속 (m/s)")
    save(fig, "fig_flow_vertical.png")


# ── 화면 캡처 가공 ─────────────────────────────────────────────────
def crop(src, box, name, scale=1.0):
    img = Image.open(src).convert("RGB").crop(box)
    if scale != 1.0:
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    img.save(OUT / name)
    print("saved", name, img.size)
    return img


VIEW = (322, 92, 1258, 898)  # 3D 뷰어 영역


def shot(folder, name):
    return SHOTS / folder / name


def screens():
    # 기본 vs CFD (같은 카메라)
    a = crop(shot("shots4", "20_basic_end.png"), VIEW, "_tmp_basic.png")
    b = crop(shot("shots4", "21_cfd_bed_persp.png"), VIEW, "_tmp_cfd.png")
    w, h = a.size
    canvas = Image.new("RGB", (w * 2 + 12, h), "white")
    canvas.paste(a, (0, 0))
    canvas.paste(b, (w + 12, 0))
    canvas.save(OUT / "fig_basic_vs_cfd.png")
    (OUT / "_tmp_basic.png").unlink()
    (OUT / "_tmp_cfd.png").unlink()
    print("saved fig_basic_vs_cfd.png")

    # 세굴 진행(등심선) 3장
    box = (420, 250, 1160, 720)
    imgs = [crop(shot("shots5", f), box, f"_tmp{i}.png") for i, f in
            enumerate(["40_iso_t300.png", "41_iso_t900.png", "42_iso_t1800.png"])]
    w, h = imgs[0].size
    canvas = Image.new("RGB", (w * 3 + 24, h), "white")
    for i, im in enumerate(imgs):
        canvas.paste(im, (i * (w + 12), 0))
    canvas.save(OUT / "fig_isolines_time.png")
    for i in range(3):
        (OUT / f"_tmp{i}.png").unlink()
    print("saved fig_isolines_time.png")

    crop(shot("shots5", "42_iso_t1800.png"), VIEW, "fig_isolines_t1800.png")
    crop(shot("shots5", "43_iso_mesh_t1800.png"), VIEW, "fig_mesh_t1800.png")
    crop(shot("shots5", "44_bed_persp_zoom.png"), VIEW, "fig_bed_persp.png")
    crop(shot("shots4", "28_cfd_pathlines_wake_top.png"), VIEW, "fig_pathlines_top.png")
    crop(shot("shots4", "29_cfd_pathlines_persp.png"), VIEW, "fig_pathlines_persp.png")
    crop(shot("shots4", "30_cfd_vectors_top.png"), VIEW, "fig_vectors.png")
    crop(shot("shots4", "31_cfd_cutplane.png"), VIEW, "fig_cutplane.png")
    # 프로브 카드·레이어 패널(확대)
    crop(shot("shots4", "27_cfd_probe.png"), (330, 100, 548, 290), "fig_probe_card.png", 2.2)
    crop(shot("shots4", "31_cfd_cutplane.png"), (944, 146, 1250, 482), "fig_layer_panel.png", 1.8)
    crop(shot("shots4", "27_cfd_probe.png"), VIEW, "fig_probe_full.png")


if __name__ == "__main__":
    fig_architecture()
    fig_colormaps()
    fig_flow_plan()
    fig_flow_vertical()
    screens()
