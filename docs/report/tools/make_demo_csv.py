"""화면 시연용 CSV 생성 (경량화 CSV 형식: x_m, y_m, t0000s, …).

FLOW-3D 해석 결과가 아니라 직접 만든 합성 데이터다. 교각 3개 주위에 깊이가 서로 다른 가우시안 세굴 구덩이와
하류측 퇴적을 만들어, 위험 등급 3단계(심각·경계·주의)가 모두 화면에 나타나게 한다.
파일명이 케이스 이름(s01)이어야 앱이 시나리오 S01 을 적용한다.
사용: python make_demo_csv.py <출력 폴더>   → <출력 폴더>/s01.csv
"""
import sys
from pathlib import Path

import numpy as np

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
xs = np.round(np.arange(0, 1.7001, 0.02), 4)
ys = np.round(np.arange(-0.75, 0.7501, 0.02), 4)
times = list(range(0, 1801, 150))
# (x, y, 세굴 진폭 m) — 교각 간격 0.27 m, 중심은 CSV 범위의 중앙
piers = [(0.85, -0.27, 0.150), (0.85, 0.0, 0.105), (0.85, 0.27, 0.070)]
X, Y = np.meshgrid(xs, ys)
cols = []
for t in times:
    g = 1 - np.exp(-t / 500.0)
    v = np.full_like(X, 1e-7)  # 구조물 점유 셀(정확히 0)과 구분하기 위한 아주 작은 값
    for px, py, amp in piers:
        r = np.hypot(X - px, Y - py)
        pit = -amp * g * np.exp(-((r / 0.07) ** 2))
        dep = 0.014 * (1 - np.exp(-t / 600.0)) * np.exp(-((((X - (px + 0.17)) / 0.12) ** 2) + ((Y - py) / 0.07) ** 2))
        v = v + pit + dep
    for px, py, _ in piers:
        v[np.hypot(X - px, Y - py) < 0.04] = 0.0  # 기둥 점유 셀
    cols.append(v)
with open(out / "s01.csv", "w", encoding="utf-8") as f:
    f.write("x_m,y_m," + ",".join(f"t{t:04d}s" for t in times) + "\n")
    for i in range(X.size):
        f.write(f"{X.ravel()[i]:.4f},{Y.ravel()[i]:.4f}," + ",".join(f"{c.ravel()[i]:.6e}" for c in cols) + "\n")
print("written", out / "s01.csv")
