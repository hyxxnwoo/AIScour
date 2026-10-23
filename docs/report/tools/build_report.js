// 단계보고서 삽입용 Word 문서 생성. 사용: node build_report.js <figures 폴더> <출력 docx>
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, LevelFormat, VerticalAlign,
} = require('docx');

const FIG = process.argv[2];
const OUT = process.argv[3];
const FONT = { ascii: 'Malgun Gothic', hAnsi: 'Malgun Gothic', eastAsia: 'Malgun Gothic', cs: 'Malgun Gothic' };
const MONO = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Malgun Gothic', cs: 'Consolas' };
const CONTENT_W = 9638; // A4, 좌우 여백 2cm (DXA)
const NAVY = '1F3A5F';
const GRAY = '5A6672';

// ── 텍스트 도우미: **굵게**, `코드` ─────────────────────────────────
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: MONO, size: (base.size || 21) - 2, ...base, color: '8A2B2B' }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

const P = (text, opts = {}) =>
  new Paragraph({
    children: runs(text, opts.run || {}),
    spacing: { after: 120, line: 340 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    indent: opts.indent,
    keepNext: opts.keepNext,
  });

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })], keepNext: true });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })], keepNext: true });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT })], keepNext: true });

const BUL = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: 'bullets', level },
    children: runs(text),
    spacing: { after: 60, line: 330 },
  });

// ── 표 ──────────────────────────────────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 4, color: 'A9B4C0' };
const borders = { top: border, bottom: border, left: border, right: border };
let tableNo = 0;
let figNo = 0;

function cell(text, w, o = {}) {
  const paras = String(text).split('\n').map(
    (line) =>
      new Paragraph({
        alignment: o.align || AlignmentType.LEFT,
        spacing: { after: 20, line: 290 },
        children: runs(line, { size: o.size || 19, bold: o.bold, color: o.color }),
      }),
  );
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: paras,
  });
}

function caption(kind, text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: kind === '표' ? 160 : 60, after: kind === '표' ? 80 : 200 },
    keepNext: kind === '표',
    children: [
      new TextRun({ text: `${kind} ${kind === '표' ? ++tableNo : ++figNo}. `, bold: true, font: FONT, size: 19, color: NAVY }),
      new TextRun({ text, font: FONT, size: 19, color: '222B36' }),
    ],
  });
}

function table(title, header, rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const out = [];
  if (title) out.push(caption('표', title));
  const trs = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: header.map((h, i) => cell(h, widths[i], { fill: 'DCE6F1', bold: true, align: AlignmentType.CENTER })),
    }),
    ...rows.map(
      (r) =>
        new TableRow({
          cantSplit: true,
          children: r.map((c, i) => cell(c, widths[i], { align: o.center && o.center.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT })),
        }),
    ),
  ];
  out.push(new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: trs }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

function note(text, fill = 'FFF6DD', edge = 'E0B93C') {
  const b = { style: BorderStyle.SINGLE, size: 6, color: edge };
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: CONTENT_W, type: WidthType.DXA },
              borders: { top: b, bottom: b, left: b, right: b },
              shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: text.split('\n').map(
                (t) => new Paragraph({ spacing: { after: 40, line: 310 }, children: runs(t, { size: 19 }) }),
              ),
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

// ── 그림 ─────────────────────────────────────────────────────────────
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(file, widthPx, text) {
  const full = path.join(FIG, file);
  const { w, h } = pngSize(full);
  const height = Math.round((widthPx * h) / w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 120, after: 40 },
      children: [new ImageRun({ type: 'png', data: fs.readFileSync(full), transformation: { width: widthPx, height }, altText: { title: text, description: text, name: file } })],
    }),
    caption('그림', text),
  ];
}

// 두 장을 좌우로 나란히 놓고 캡션 하나를 붙인다.
function figurePair(files, widthEach, text) {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const nb = { top: none, bottom: none, left: none, right: none };
  const colW = Math.floor(CONTENT_W / 2);
  const cells = files.map((f) => {
    const full = path.join(FIG, f);
    const { w, h } = pngSize(full);
    return new TableCell({
      width: { size: colW, type: WidthType.DXA },
      borders: nb,
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: 'png', data: fs.readFileSync(full), transformation: { width: widthEach, height: Math.round((widthEach * h) / w) }, altText: { title: text, description: text, name: f } })],
      })],
    });
  });
  return [
    new Table({ width: { size: colW * 2, type: WidthType.DXA }, columnWidths: [colW, colW], rows: [new TableRow({ cantSplit: true, children: cells })] }),
    caption('그림', text),
  ];
}

// ══════════════════════════════════════════════════════════════════
// 본문
// ══════════════════════════════════════════════════════════════════
const body = [];
const add = (...xs) => xs.flat().forEach((x) => body.push(x));

// 표지
add(
  new Paragraph({ spacing: { before: 1800, after: 200 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: '연구과제 단계보고서 삽입 자료', font: FONT, size: 24, color: GRAY })] }),
  new Paragraph({
    spacing: { after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 8 } },
    children: [new TextRun({ text: '3D 세굴 가시화', font: FONT, size: 56, bold: true, color: NAVY })],
  }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: 'CFD 보기 모드 개발 결과', font: FONT, size: 40, bold: true, color: '2B3A4A' })] }),
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: '시설 관리자용 요약 화면과 연구자용 해석 결과 검토 화면을 하나의 3D 뷰어에서 전환', font: FONT, size: 22, color: GRAY })],
  }),
  new Paragraph({ spacing: { before: 1200, after: 60 }, children: [new TextRun({ text: '작성일  2026. 10. 22.', font: FONT, size: 21 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: '대상 화면  3D 세굴 가시화(5번), 평면·단면(6번), 등급·하상(7번), 타임라인·시계열(8번), 위험 판정(9번)', font: FONT, size: 21 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: '개발 상태  구현·시험 완료 (실제 GPU 환경 성능 검증과 실측 유속 연동은 후속 과제)', font: FONT, size: 21 })] }),
  new Paragraph({ pageBreakBefore: true, children: [] }),
);

// 요약
add(
  H1('요약'),
  P('3D 세굴 가시화 뷰어에 **[기본 | CFD] 보기 모드 전환**을 추가하였다. 기본 모드는 기존 화면 그대로 시설 관리자의 판단을 돕고, CFD 모드는 FLOW-3D·ParaView 후처리와 유사한 표현(연속 컨투어, 등심선, 유선, 벡터, 단면, 자유수면, 클릭 프로브)으로 연구자가 해석 결과를 검토하도록 한다. 두 모드는 같은 데이터와 같은 시점(t)을 보여 주며 표현 방식만 다르다.'),
  P('현재 확보된 결과 CSV에는 하상 변화량(scrdif)만 있고 유속(u, v, w), 전단응력, 수면고가 없다. 이에 따라 **해석 유속이 있으면 그 값을, 없으면 해석해 기반 합성 유동장을 자동으로 쓰는 구조**를 만들고, 합성 값이 쓰인 레이어에는 \'목업\' 표시를, 계획서에 없는 수치에는 \'잠정\' 표시를 붙였다.'),
);
add(
  ...table(
    '핵심 결과 요약',
    ['구분', '결과'],
    [
      ['개발 범위', '보기 모드 전환, 하상 CFD 표현, 유동장(유선·벡터·단면), 자유수면, 클릭 프로브, 구조물 충돌 모델, CSV 업로드 개선 4건'],
      ['신규 코드', '소스 19개 파일 2,426줄, 시험 10개 파일 861줄(신규 시험 49건)'],
      ['검증', '타입 검사 오류 0건, 전체 시험 255건 통과(기존 206건 + 신규 49건), 헤드리스 Chrome 화면 시연에서 콘솔 오류 0건'],
      ['성능', '유선 700개 갱신 1.5 ms/프레임(CPU). 소프트웨어 렌더링 환경 상대 측정: 기본 모드 6.2 FPS 대비 CFD 기본 레이어 5.9 FPS (약 5% 저하)'],
      ['미완·한계', '실측 유속 미연동(합성 유동장 사용), GPU 환경 절대 FPS 미측정, 합성 모델 계수는 잠정값'],
    ],
    [1900, 7738],
  ),
);

add(new Paragraph({ pageBreakBefore: true, children: [] }));

// 1. 개요
add(
  H1('1. 개발 개요'),
  H2('1.1 개발 목적 및 배경'),
  P('기존 3D 세굴 가시화 화면은 교각별 세굴심, 등급, 잔여 여유율을 시설 관리자가 빠르게 판단하도록 구성되어 있다. 반면 연구자가 해석 결과를 검토하려면 하상 변화의 연속 분포, 등심선, 유속장의 방향과 크기, 단면 분포, 임의 지점의 수치를 확인할 수 있는 후처리 형태의 화면이 필요하다. 두 목적의 화면을 별도 시스템으로 나누지 않고, **하나의 뷰어에서 표현 방식만 전환**하도록 개발하였다.'),
  H2('1.2 개발 범위'),
  ...table(
    '개발 범위',
    ['구분', '내용', '비고'],
    [
      ['A. 보기 모드 전환', '[기본|CFD] 토글, 전역 상태, 마지막 모드 기억, 캡처 파일명에 모드 표기', '모든 뷰어 하위 화면 공통'],
      ['B. 하상 표현', '적-백-청 발산형 컬러, 법선 음영, 등심선(라벨), 해석 격자 와이어프레임', 'CFD 모드 전용'],
      ['C. 유동장', '유선(입자 추적), 벡터 글리프, 연직 단면(컨투어+면내 벡터), 말굽와류·카르만 와류열', '합성 유동장 사용 시 \'목업\''],
      ['D. 자유수면', '교각 전면 수면 상승·측면 하강·후면 파형, 투명도 조절', '합성 모델, 항상 \'목업\''],
      ['E. 후처리 UI', '레이어 토글, 컬러바 2종, 좌표축, t·Frame 오버레이, 클릭 프로브', '프로브 전단응력은 \'잠정\''],
      ['F. 구조물 상호작용', '기둥·하단부 고체 모델, 유선 비침투, 후류 와류', '원형/사각 기둥, 4종 하단부'],
      ['G. CSV 업로드 개선', '수면 기본 체크, 수면 색 유지, 안내 문구 정리, 표기 변경 4건', '기본 모드 포함'],
    ],
    [1900, 5238, 2500],
  ),
  H2('1.3 개발·검증 환경'),
  ...table(
    '개발·검증 환경',
    ['항목', '내용'],
    [
      ['3D 라이브러리', 'Three.js 0.169 (WebGL)'],
      ['언어·빌드', 'TypeScript 5.6, Vite 5'],
      ['시험 도구', 'Vitest 2 (jsdom), 타입 검사 `tsc --noEmit`'],
      ['화면 검증', 'Chrome 헤드리스(DevTools Protocol 자동 조작), SwiftShader 소프트웨어 렌더링, 1600×900'],
      ['구조', '프레임워크 없이 순수 TypeScript 클래스와 DOM, 기존 저장소 코드 스타일 준수'],
    ],
    [2400, 7238],
  ),
);

// 2. 현황 분석
add(
  H1('2. 현황 분석'),
  H2('2.1 기존 시스템 구조'),
  BUL('하나의 캔버스를 화면 4~9번이 공유하고, 파라미터나 CSV가 바뀌면 장면 모듈 묶음을 통째로 교체한다.'),
  BUL('하상 메시는 정점 단위 높이·색을 쓰며 프레임이 바뀔 때만 갱신한다. 수면은 별도 셰이더 메시다.'),
  BUL('시간은 타임라인 컨트롤이 보유하고, 렌더 루프 한 곳에서 각 모듈의 `updateAtTime(t)`를 호출한다. 프레임 간 보간은 없다.'),
  BUL('전역 스토어 없이 화면 라우터, 공유 상태 객체, 진입점의 클로저 변수가 혼재한다. 사용자 설정 저장은 로그인 여부(세션)뿐이었다.'),
  H2('2.2 데이터 제약'),
  P('경량화 결과 CSV(`x_m, y_m, t0000s, …`)는 격자점별 시간 열에 하상 변화량(scrdif)만 담고 있다. **유속 u·v·w, 전단응력, 수면고는 데이터에 없다.** 저장소에는 u, v, w, scrdif 열을 가진 FLOW-3D 원본 형식 샘플(`public/data/sample_head.csv`)이 있으나 현재 파서는 이 형식을 읽지 않는다. 따라서 유동 관련 표현은 다음 원칙으로 설계하였다.'),
  BUL('해석 유속이 있으면 그 값을 쓰고, 없으면 합성 유동장을 쓴다(자동 전환).'),
  BUL('합성 값이 쓰인 레이어에는 \'목업(합성 유동장)\', 계획서에 없는 수치에는 \'잠정\'을 표시한다.'),
  H2('2.3 항목별 구현 가능성 분석과 최종 결과'),
  ...table(
    '분석 시점의 판정과 최종 구현 결과',
    ['항목', '분석 시점 판정', '최종 구현'],
    [
      ['보기 모드 토글·전역 상태', '추가 개발', '완료'],
      ['마지막 모드 기억', '추가 개발 (사용자 식별자 없음)', '완료 (브라우저 단위)'],
      ['캡처 파일명에 모드 표기', '기존 구조로 가능', '완료'],
      ['연속 컨투어, 법선 음영', '기존 구조로 가능', '완료 (CFD 컬러맵 신규)'],
      ['등심선, 와이어프레임', '추가 개발', '완료'],
      ['유선, 벡터 글리프', '추가 개발', '완료'],
      ['말굽와류, 카르만 와류열', '추가 개발 + 데이터 없음', '합성 모델로 완료 (목업)'],
      ['연직 단면 (cut-plane)', '추가 개발 + 데이터 없음', '완료 (목업)'],
      ['자유수면', '기존 구조 + 추가', '완료 (합성 교란, 목업)'],
      ['컬러바, 좌표축, t·Frame 오버레이', '기존 구조 + 추가', '완료'],
      ['클릭 프로브', '추가 개발 (전단응력 데이터 없음)', '완료 (전단응력 잠정)'],
    ],
    [3600, 3200, 2838],
  ),
);

// 3. 시스템 설계
add(
  H1('3. 시스템 설계'),
  H2('3.1 구성'),
  P('입력 데이터 → 상태·모델 → 3D 렌더 모듈 → 사용자 인터페이스의 4개 층으로 구성한다. 타임라인 시각 t는 상태·모델 층에서 렌더 모듈로 전달되고, 사용자 조작(토글, 슬라이더, 클릭)은 상태 층을 거쳐 렌더 모듈에 반영된다.'),
  ...figure('fig_architecture.png', 610, 'CFD 보기 모드 시스템 구성'),
  H2('3.2 설계 원칙'),
  ...table(
    '설계 원칙',
    ['원칙', '구현 방식'],
    [
      ['기본 모드 불변', '기본 모드의 화면과 성능은 기존과 같다. CFD 전용 UI는 숨기고, CFD 전용 계산(유동장·유선·등심선 등)은 해당 레이어가 켜질 때 처음 생성한다.'],
      ['전환 시 상태 유지', '카메라 위치, 타임라인 시점, 재생 상태, 선택 교각, 교각 모니터 수치는 모드와 무관한 기존 상태를 그대로 쓴다.'],
      ['공통 규칙 고정', '위험 등급 4색(관심 #2E7DD1, 주의 #E8B21A, 경계 #E8791A, 심각 #D02B2B)과 교각 기둥의 등급색은 변경하지 않는다. 세굴심·등급·잔여 여유율은 기존 공통 계산만 사용하고 모드별로 따로 계산하지 않는다.'],
      ['데이터 유무에 따른 자동 전환', '유동장 소스가 해석 유속 존재 여부를 판단해 실데이터 또는 합성 유동장을 선택하고, 출처를 화면에 표시한다.'],
      ['성능', '하상 컨투어·등심선은 프레임이 바뀔 때만 재계산한다. 입자 수, 벡터 밀도 등은 설정 상수로 분리한다.'],
    ],
    [2400, 7238],
  ),
  H2('3.3 모듈 구성'),
  ...table(
    '신규·수정 모듈',
    ['모듈', '역할', '위치'],
    [
      ['viewState (수정)', '보기 모드 상태, 브라우저 저장·복원', 'src/state/viewState.ts'],
      ['cfdLayers', '레이어 8종 on/off, 벡터 밀도, 수면 투명도, 단면 위치', 'src/state/cfdLayers.ts'],
      ['cfdFlowField', '유동장 소스(합성 / 해석 데이터), 자동 전환, 속도 범위 추정', 'src/data/cfdFlowField.ts'],
      ['flowSolids', '기둥·하단부 고체 판정, 표면 밀어내기', 'src/data/flowSolids.ts'],
      ['Terrain (수정)', '하상 색 방식(기본/CFD/단색), 와이어프레임, 등심선 연동', 'src/modules/Terrain.ts'],
      ['BedIsolines', '등심선 선분·라벨 렌더', 'src/modules/BedIsolines.ts'],
      ['CfdPathlines', '유선(입자 추적, 꼬리, 재투입)', 'src/modules/CfdPathlines.ts'],
      ['CfdVectorGlyphs', '벡터 글리프(밀도 조절)', 'src/modules/CfdVectorGlyphs.ts'],
      ['CfdCutPlane', '연직 단면 컨투어와 면내 벡터', 'src/modules/CfdCutPlane.ts'],
      ['TerrainWater (수정)', '자유수면 교란 셰이더, 기본 물 색 유지', 'src/modules/TerrainWater.ts'],
      ['CfdProbe 계열', '클릭 프로브 계산·카드·표시 링', 'src/utils/cfdProbe.ts 외 2'],
      ['UI 컴포넌트', '토글, 레이어 패널, 컬러바, 오버레이, 좌표축', 'src/components/ (신규 6개)'],
      ['유틸', 'CFD 컬러맵(세굴·유속), 등심선 알고리즘', 'src/utils/ (신규 4개)'],
    ],
    [2300, 4538, 2800],
  ),
);

// 4. 개발 내용 및 결과
add(
  H1('4. 개발 내용 및 결과'),
  P('아래 화면은 헤드리스 Chrome에서 실제 앱을 구동해 캡처한 것이다. 시연에는 하상 변화를 가진 **시연용 합성 CSV**(표 11)를 사용하였으며 FLOW-3D 해석 결과가 아니다. 유동장은 합성 유동장(목업)이다.'),
  H2('4.1 보기 모드 전환'),
  P('3D 뷰어 우측 상단에 [기본 | CFD] 세그먼트를 두었다. 기본값은 \'기본\'이며 마지막 선택은 브라우저에 저장된다. 5~9번 화면을 오가도 같은 모드가 유지되고, 화면 캡처(P 키) 파일명에는 CFD 모드일 때 `_CFD`가 붙는다(예: `SCDT_05_3D세굴가시화_CFD_20261022_0805.png`).'),
  ...figure('fig_basic_vs_cfd.png', 620, '같은 시점·같은 카메라에서의 기본 모드(좌)와 CFD 모드(우). 교각 기둥색(등급색)은 두 모드에서 동일하다.'),
  P('CFD 모드에서는 우측 상단에 레이어 패널이 나타난다. 하상 컨투어, 등심선, 메시, 유선, 벡터, 단면, 수면, 교량의 8개 레이어를 개별로 켜고 끌 수 있고, 유속에 의존하는 레이어에는 합성 유동장일 때 \'목업\' 태그가 붙는다.'),
  ...table(
    '레이어 목록',
    ['레이어', '내용', '기본', '조절 항목'],
    [
      ['하상 컨투어', '세굴 적색 / 0 흰색 / 퇴적 청색 연속 컬러', '켜짐', '끄면 단색 하상'],
      ['등심선', '하상 변화량 등치선, 주요선 라벨', '꺼짐', '간격 자동(상한 0.5 m)'],
      ['메시', '해석 격자 와이어프레임', '꺼짐', '-'],
      ['유선', '유속 크기로 색을 칠한 입자 추적선', '켜짐', '입자 수·꼬리(설정값)'],
      ['벡터', '속도 벡터 화살표', '꺼짐', '밀도 1~5'],
      ['단면', '연직 단면 유속 컨투어 + 면내 벡터', '꺼짐', 'XZ(A–A′)/YZ(B–B′), 위치, 연동'],
      ['수면', '교란이 있는 반투명 자유수면', '켜짐', '투명도'],
      ['교량', '교량 구조물 표시', '켜짐', '-'],
    ],
    [1700, 4000, 1000, 2938],
    { center: [2] },
  ),
  ...figure('fig_layer_panel.png', 220, 'CFD 레이어 패널(단면 설정 표시 상태)'),

  H2('4.2 하상(세굴) 표면'),
  P('하상 컬러는 정점 보간으로 부드러운 연속 분포를 보이며, 법선 음영으로 세굴공의 깊이감을 나타낸다. CFD 모드의 컬러맵은 세굴을 적색, 퇴적을 청색, 변화 없음을 흰색으로 하는 발산형이다. 기본 모드의 모래색 컬러맵은 그대로 유지하며, 컬러바도 모드에 맞춰 바뀐다.'),
  ...figure('fig_colormaps.png', 500, '컬러맵 비교: 기본 모드 하상(위), CFD 하상(가운데), CFD 유속(아래)'),
  ...figure('fig_bed_persp.png', 430, 'CFD 모드 하상. 교각 전면(상류측)에 적색 세굴, 후면(하류측)에 청색 퇴적이 나타난다.'),
  P('**등심선**은 격자 위 변화량의 등치선(marching squares)으로 구하며, 프레임이 바뀔 때만 다시 계산한다. 간격은 최대 변화량의 약 1/4을 1·2·5×10ⁿ 단위로 맞추고 상한을 0.5 m로 둔다. 지시서의 0.5 m 간격은 수 cm 규모의 이 수조 실험에서는 등심선이 하나도 나오지 않으므로, 간격을 자동으로 정하고 필요 시 고정값을 줄 수 있게 하였다. 짝수 번째 선(주요선)은 굵게 그리고 `-0.02 m`와 같은 라벨을 단다.'),
  ...figure('fig_isolines_time.png', 640, '세굴 진행에 따른 등심선 변화 (t = 300 s, 900 s, 1800 s)'),
  ...figurePair(['fig_isolines_t1800.png', 'fig_mesh_t1800.png'], 300, 'CFD 하상 + 등심선(좌), 해석 격자 와이어프레임을 함께 표시한 모습(우) (t = 1800 s, 평면 시점)'),

  H2('4.3 유동장 모델'),
  P('해석 유속이 없는 현재 데이터에서 유동 표현을 하기 위해 해석해 기반 **합성 유동장**을 만들었다. 실제 u·v·w가 들어오면 해석 데이터를 삼선형 보간해 쓰는 `SeriesCfdFlow`로 자동 전환된다.'),
  ...table(
    '합성 유동장 구성 요소 (계수는 모두 잠정값)',
    ['구성 요소', '표현', '목적'],
    [
      ['접근류', '1/7 멱법칙, 깊이평균이 접근 유속 U가 되도록 정규화', '하상 부근 유속 저하'],
      ['교각 주변 포텐셜류', 'u = U[1 − R²(x²−z²)/r⁴], v = −2UR²xz/r⁴ (R: 이 높이에서의 등가 반경)', '전면 정체, 측면 가속'],
      ['후류 평균 결손', '진폭 0.35/(1+0.35(s−1)), 폭 R(1+0.25(s−1)) 가우시안 (s = x/R)', '교각 뒤 속도 저하와 회복'],
      ['카르만 와류열', '연직축 Lamb–Oseen 와류가 좌우에서 번갈아 생성, 0.85U로 하류 이동, 동시 8개 유지, 좌우 교대 간격 0.5/(St·U/D), St=0.2', '후면 소용돌이'],
      ['말굽와류', '반경–연직 평면 Lamb–Oseen 와류, 중심 반경 1.5R, 높이 min(0.12h, 1.2R), 상류 반쪽에 가중', '교각 전면 하강류·하상 부근 외향류'],
      ['고체', '기둥·하단부 내부는 유속 없음', '구조물 비침투'],
      ['하상 전단응력(프로브용)', 'τ = ρ·Cf·U_bed², ρ=1000 kg/m³, Cf=0.0035', '전단응력 표시(잠정)'],
    ],
    [2200, 5038, 2400],
  ),
  P('다음 그림은 이 모델의 실제 출력이다(교각 3개, 정사각 하단부, S01 조건: 유속 0.25 m/s, 수심 0.15 m, 교각 간격 0.27 m). 그림 8의 왼쪽은 수심 중간 수평면의 유속 크기와 유선, 오른쪽은 같은 시각의 연직 와도이다. 교각 좌우에서 번갈아 떨어져 나온 양(적색)·음(청색) 와류가 하류로 이동하며 약해지며(그림 9), 유선이 이 와류를 따라 굽이치는 것을 볼 수 있다.'),
  ...figure('fig_flow_plan.png', 640, '합성 유동장 출력(수평면, t = 4.0 s): (a) 유속 크기와 유선, (b) 연직 와도'),
  ...figure('fig_vortex_time.png', 640, '와류의 하류 이동(연직 와도, 같은 구도, 시각 간격 0.3125 s)'),
  P('교각 전면의 종단면에서는 기둥 면으로 향하는 흐름이 하단부 위에서 꺾여 내려가고, 하상 부근에서 상류 쪽으로 되돌아가는 말굽와류 순환이 나타난다.'),
  ...figure('fig_flow_vertical.png', 600, '교각 전면 종단면(중심선)의 유속과 유선: 하강류와 하상 부근 말굽와류'),

  H2('4.4 유동장 가시화'),
  P('**유선(pathline)**은 입자를 유동장에서 2차 중점법(RK2)으로 이동시키고, 꼬리를 링 버퍼로 유지하며 끝으로 갈수록 투명하게 그린다. 색은 유속 크기이다. 입자는 재생 중에만 이동하고 일시정지하면 멈추며, 타임라인을 크게 건너뛰면 입자를 다시 투입한다. 입자의 일부는 교각 전면 하상 부근(말굽와류)과 교각 바로 뒤(후류)에 우선 투입해 와류가 잘 보이게 하였다.'),
  ...figurePair(['fig_pathlines_top.png', 'fig_pathlines_persp.png'], 300, '유선. 평면 시점(좌, 교량 숨김)에서는 하단부와 기둥을 따라 흐름이 갈라져 뒤에서 소용돌이를 만들고, 투시 시점(우)에는 자유수면과 유속 컬러바(\'목업\' 표시)가 함께 보인다.'),
  P('**벡터 글리프**는 수심 중간 높이의 수평면에 화살표를 격자로 배치하고 길이를 속력에 비례하게 하며, 밀도(1~5)를 슬라이더로 조절한다. **연직 단면**은 종단(XZ, A–A′)과 횡단(YZ, B–B′) 중에서 고르고, 유속 크기 컨투어와 면내 벡터를 함께 그린다. 위치는 슬라이더로 조절하며, \'연동\' 버튼은 평면·단면 화면의 단면선(선택 교각)에 위치를 맞춘다.'),
  ...figurePair(['fig_vectors.png', 'fig_cutplane.png'], 300, '벡터 글리프(좌, 평면 시점)와 종단 단면(우, XZ A–A′)의 유속 컨투어·면내 벡터. 교각 내부는 투명하게 비어 있다.'),
  P('유속 컬러맵은 세굴 컬러맵 및 위험 등급 4색과 겹치지 않도록 별도의 순차형(보라–청록–연두)으로 정하였고, 자동 시험으로 등급 4색·세굴 컬러맵 주요 색과의 RGB 거리가 35를 넘는지 확인한다.'),
  ...figure('fig_grade_colors.png', 500, '위험 등급 4색(고정)'),

  H2('4.5 자유수면'),
  P('수면은 반투명으로 표시하며 투명도를 슬라이더로 조절한다. CFD 모드에서는 수면 셰이더가 교각 전면 수면 상승, 측면 하강(포텐셜류 베르누이 η = (U²/2g)(2R²cos2θ/r² − R⁴/r⁴)), 후면 와류 주기의 파형을 더한다. 실험실 규모에서는 U²/2g가 수 mm이므로 시각화용으로 6배 과장하였다. 해석 데이터에 수면 필드가 없으므로 이 레이어는 해석 유속이 있어도 항상 \'목업\'으로 표시한다.'),

  H2('4.6 후처리 도구'),
  BUL('**좌표축 트라이어드**: 카메라 방향을 따라 회전하며 X(흐름), Y(횡단), Z(연직)를 표시한다.'),
  BUL('**시각·프레임 오버레이**: `t = 012.3 s / Frame 5 / 90` 형식으로 현재 시각과 프레임 번호를 표시한다.'),
  BUL('**컬러바 2종**: 세굴심(m)은 기존 범례를 CFD 색으로 전환해 쓰고, 유속(m/s)은 별도 컬러바를 둔다. 합성이면 \'목업\' 태그가 붙는다.'),
  BUL('**클릭 프로브**: 하상을 클릭하면 좌표, 표고 변화, 유속(성분 포함), 하상 전단응력을 카드로 표시하고, 재생하면 같은 지점의 값이 시각에 따라 갱신된다. 교각을 클릭하면 교각 선택으로만 처리하고, 궤도 회전 드래그의 끝에서 발생하는 클릭은 무시한다.'),
  ...figure('fig_probe_full.png', 430, '클릭 프로브(좌상단 카드). 평면 시점에서 하상의 한 점을 선택한 모습'),
  ...figure('fig_probe_card.png', 200, '프로브 카드 확대: 좌표, 표고 변화, 유속(목업), 전단응력(잠정·목업)'),

  H2('4.7 구조물 상호작용: 기둥·하단부 비침투와 후류 와류'),
  P('초기 구현에서는 교각을 반경 R의 원기둥 하나로만 취급해, 기둥보다 넓은 하단부(footing) 안쪽과 사각 기둥의 모서리를 유선이 통과하는 문제가 있었다. 입자가 고체 안에 들어가면 밀려나지 않고 소멸 후 재투입되어 표면 근처에서 뚫리는 것처럼 보였다. 이를 다음과 같이 수정하였다.'),
  BUL('`PierMarker`가 그리는 것과 같은 치수의 고체 모델을 도입하였다(기둥: 원형·사각, 하단부: 원형·타원형·정사각·직사각).'),
  BUL('유동장은 고체 내부를 비우고, 하단부 높이 이하에서는 하단부 크기를 기준으로 흐름이 비켜 가게 하였다.'),
  BUL('유선 입자가 고체 안으로 들어가면 가장 가까운 표면 밖으로 밀어내 표면을 따라 미끄러지게 하고, 하단부 윗면 가까이에서는 위로 올라타게 하였다.'),
  BUL('후류는 단순 사인파 진동 대신 교각 좌우에서 번갈아 떨어져 나오는 와류열로 바꾸어, 입자가 실제로 소용돌이를 돌며 하류로 이동하게 하였다. 하단부가 넓은 경우 와류는 하단부 가장자리에서 떨어져 나간다.'),

  H2('4.8 CSV 업로드 개선 4건'),
  ...table(
    'CSV 업로드 개선',
    ['요청', '처리 내용'],
    [
      ['업로드 시 \'지형 위 수면\' 기본 체크', '하상 변화만 있는 CSV에서도 수면을 켠 상태로 시작'],
      ['시뮬레이션 중 수면 색 변화 방지', '유속 데이터가 없는 CSV에서는 항목 전환·재생과 무관하게 기본 물 색(#1d6fa8) 유지(`setBaseColorOnly`)'],
      ['결과 CSV 선택 창 안내 문구 정리', '\'결과 CSV 를 고릅니다.\'만 남기고 나머지 문구 제거(케이스 5개 제한 동작은 유지)'],
      ['\'d50\' 표기를 \'하상·퇴적물 입경\'으로', '화면에 보이는 표기만 교체. 코드 필드명과 내보내기 CSV 헤더는 유지'],
    ],
    [3600, 6038],
  ),
);

// 5. 시험 및 검증
add(
  H1('5. 시험 및 검증'),
  H2('5.1 자동 시험'),
  P('전체 시험은 53개 파일, 255건이며 모두 통과하였다(기존 206건 + 이번 개발 신규 49건). 타입 검사(`tsc --noEmit`)는 오류가 없다. 이번에 추가한 시험은 다음과 같다.'),
  ...table(
    '신규 자동 시험',
    ['시험 파일', '검증 내용', '건수'],
    [
      ['viewMode', '모드 저장·복원, 토글 동작, 캡처 파일명', '3'],
      ['cfdOverlay', 't·Frame 표기, 레이어 스토어, 레이어 패널, 좌표축 회전', '4'],
      ['cfdBed', 'CFD 컬러맵, 등심선 간격·위치·안장점, 하상 색·와이어프레임·등심선 동작', '6'],
      ['cfdFlowField', '합성 유동장(고체, 접근류, 후류, 말굽와류, 전단응력), 실데이터 자동 전환, 와류 순환 방향·이동', '10'],
      ['cfdVelocityColor', '유속 컬러맵과 등급 4색·세굴 색의 분리, 범위 밖 고정', '2'],
      ['cfdFlowViz', '유선 영역·수심 유지, 정지·스크럽, 벡터 밀도, 컬러바', '6'],
      ['cfdSurface', '자유수면 교란 유니폼, 교각 수 상한, 투명도, 목업 태그', '4'],
      ['cfdProbe', '프로브 계산, 고체 내부 처리, 카드 표시, 마커', '4'],
      ['cfdCutPlane', '단면 축·위치 범위, 컨투어 투명/불투명 영역, 패널 조작', '3'],
      ['cfdSolids', '기둥·하단부 고체 판정, 밀어내기, 유선 비침투(원형·사각)', '7'],
      ['합계', '', '49'],
    ],
    [2000, 6838, 800],
    { center: [2] },
  ),
  H2('5.2 화면 시연 검증'),
  P('헤드리스 Chrome으로 앱을 실제 구동해 CSV 선택 마법사부터 파싱, 적용, 모드 전환, 각 레이어 토글, 프로브 클릭까지 자동 조작하였고, 전 과정에서 **브라우저 콘솔 오류·경고가 없었다**(수면 셰이더 컴파일 포함). 이 과정에서 하단 타임라인과 겹치던 t·Frame 오버레이와 유속 컬러바의 위치를 수정하였고, 유선이 하상을 가릴 만큼 빽빽하던 기본 입자 수를 1200개에서 700개로 낮췄다.'),
  ...table(
    '화면 시연에 사용한 데이터(시연용 합성 CSV)',
    ['항목', '내용'],
    [
      ['성격', '경량화 CSV 형식(`x_m, y_m, t0000s…`)으로 직접 만든 합성 데이터. FLOW-3D 해석 결과가 아님'],
      ['격자', '2 cm 간격, 6,536점. 앱이 1 cm 격자(171×151)로 재표본화'],
      ['시각', '0~1800 s, 150 s 간격 13프레임'],
      ['세굴 형상', '교각 3개(횡방향 −0.27, 0, +0.27 m) 주위 가우시안 세굴 구덩이(최대 약 0.055 m, 시간상수 500 s), 하류측 퇴적(최대 0.012 m), 구조물 점유 셀은 0'],
      ['적용 시나리오', 'S01 기준조건: 유속 0.25 m/s, 수심 0.15 m, 기둥 간격 0.27 m, 정사각 하단부'],
      ['앱 인식 결과', '파싱 완료 171×151 격자, 프레임 13개, 교각 3개(P1…P3)'],
    ],
    [2200, 7438],
  ),
  H2('5.3 모델 검증'),
  ...table(
    '합성 유동장 검증 결과',
    ['검증 항목', '기준', '결과'],
    [
      ['후류 와류 회전 방향', '+Z 측 와류 순환 > 0, −Z 측 < 0 (서로 반대)', '통과'],
      ['와류 하류 이동', '같은 위치의 순환 크기가 시간이 지나면 감소', '통과'],
      ['후류 재순환', '후류 중심선 최소 유속 < 0.05 m/s', '통과'],
      ['말굽와류 하강류', '교각 전면 하상 부근 연직 유속 < −0.02 m/s', '통과'],
      ['하단부·기둥 비침투', '유선 정점 300프레임 동안 고체 내부 0개 (원형·사각 두 형상)', '0개 (밀어내기 비활성 시 6개 검출되어 시험의 검출력 확인)'],
      ['컬러맵 분리', '유속 컬러맵과 등급 4색·세굴 주요 색의 RGB 거리 > 35', '통과'],
    ],
    [2400, 4338, 2900],
  ),
  H2('5.4 성능'),
  P('성능 요구는 \'기본 레이어(컨투어+유선+수면)를 켠 상태에서 30 FPS 이상\'이다. 측정은 두 가지로 나누어 수행하였다.'),
  ...table(
    '처리 시간(CPU, Node 환경 측정, 교각 3개·하단부·와류 포함)',
    ['항목', '측정값', '비고'],
    [
      ['유선 갱신 (700개, 꼬리 14점)', '1.5 ms/프레임', '기본 설정'],
      ['벡터 글리프 갱신 (780개)', '0.85 ms/갱신', '0.12초마다 또는 시각 변경 시'],
      ['단면 갱신', '1.7 ms/갱신', '컨투어 96×32 + 벡터 14×5'],
    ],
    [3800, 2200, 3638],
  ),
  ...table(
    '유선 처리 시간 개선 이력 (입자 1200개 기준)',
    ['단계', '프레임당 처리 시간', '조치'],
    [
      ['최초 구현', '62 ms', '꼬리 정점마다 컬러맵 재계산이 병목'],
      ['꼬리 색 사전 계산', '6.7 ms', '점 기록 시 색을 한 번만 계산'],
      ['와류열 도입 직후', '74 ms', '교각 3개 × 와류 8개를 점마다 계산'],
      ['와류 상태 시각별 캐시 + 원거리 생략', '6.7 ms', '와류 위치·세기를 시각마다 1회 계산, 코어 밖 지수함수 생략, 먼 점 계산 생략, 적분 걸음 수 축소'],
    ],
    [3000, 2200, 4438],
  ),
  ...table(
    '렌더링 프레임율(상대 비교, 소프트웨어 렌더링)',
    ['조건', '프레임율', '기본 모드 대비'],
    [
      ['기본 모드', '6.2 FPS', '기준'],
      ['CFD 기본 레이어(컨투어+유선+수면)', '5.9 FPS', '약 5% 저하'],
      ['CFD + 등심선 + 벡터', '5.6 FPS', '약 10% 저하'],
      ['CFD 전체 레이어(+ 단면 + 메시)', '3.5 FPS', '약 44% 저하'],
    ],
    [4400, 2200, 3038],
    { center: [1, 2] },
  ),
  ...note('**성능 측정의 한계**: 위 프레임율은 GPU가 없는 소프트웨어 렌더링(SwiftShader, 1600×900) 환경이라 기본 모드조차 6.2 FPS이다. 따라서 **30 FPS 목표의 달성 여부는 이 환경에서 판정할 수 없고**, 기본 모드 대비 CFD 기본 레이어의 추가 부담이 작다는 상대 비교만 유효하다. 전체 레이어를 모두 켰을 때의 하락 원인(메시 와이어프레임, 단면 등)은 분해하지 않았다. 목표 FPS는 GPU가 있는 실사용 환경에서 재측정해야 한다.'),
);

// 6. 한계 및 향후 과제
add(
  H1('6. 한계 및 향후 과제'),
  ...table(
    '한계 및 향후 과제',
    ['구분', '내용', '향후 조치'],
    [
      ['실측 유속 미연동', '결과 CSV에 u, v, w가 없어 유동 표현은 합성 유동장(목업)이다. 저장소의 FLOW-3D 원본 형식 샘플에는 u, v, w, scrdif 열이 있으나 현재 파서가 지원하지 않는다.', '파서를 확장해 유속을 유체 격자로 채우면 코드 변경 없이 실데이터로 자동 전환된다(전환 시 \'목업\' 표시도 사라짐).'],
      ['합성 계수 잠정', '와류 강도·간격·감쇠, Strouhal 수(0.2), 마찰계수(0.0035) 등은 문헌 수준의 잠정값이다.', '실측 유속 확보 후 보정·검증'],
      ['절대 FPS 미검증', 'GPU 환경에서의 30 FPS 이상 요구는 아직 확인하지 못했다.', 'GPU 환경에서 재측정, 필요 시 입자 수·벡터 밀도 조정(설정 상수)'],
      ['하단부 높이의 불연속', '합성 유동장에서 흐름을 막는 등가 반경이 하단부 윗면 높이에서 계단식으로 바뀌어 유속에 작은 단차가 생긴다(종단면 그림 참고).', '등가 반경을 높이에 따라 연속 변화시키도록 개선'],
      ['2차원 와류만 표현', '후류 와류는 연직축 회전(수평면)만 표현하며 하상에서 올라오는 3차원 와류는 없다.', '실측 유속 확보 후 필요성 판단'],
      ['기본 모드 추적 입자', '기본 모드의 추적 입자(`FluidTracers`)는 하단부를 고려하지 않는 기존 동작이다.', '필요 시 고체 모델을 공유하도록 개선'],
      ['수면 높이 슬라이더', '수면 높이를 바꿔도 합성 유동장의 수위는 처음 값 기준이다.', '수위 변경 시 유동장 재생성'],
      ['수면 투명도 슬라이더', 'CFD 패널의 투명도와 기존 도크의 투명도 슬라이더가 서로 반영되지 않는다.', '단일 값으로 통합'],
      ['사용자별 모드 저장', '로그인 사용자 식별자가 없어 브라우저 단위로 저장한다.', '사용자 계정 체계 도입 시 사용자별 저장으로 전환'],
    ],
    [1900, 4338, 3400],
  ),
);

// 7. 산출물
add(
  H1('7. 산출물 목록'),
  ...table(
    '산출물',
    ['구분', '내용', '위치'],
    [
      ['소스 (신규)', '19개 파일, 2,426줄 (컴포넌트 6, 모듈 5, 유틸 4, 상태 1, 데이터 2, 상수 1)', 'src/components, modules, utils, state, data, constants'],
      ['소스 (수정)', '12개 파일, 약 930줄 추가', 'src/main.ts, modules/Terrain.ts, modules/TerrainWater.ts, state/viewState.ts, components/ColorLegend.ts, styles/viz.css 외'],
      ['시험', '신규 10개 파일 861줄 (49건), 기존 시험 2건 수정', 'tests/'],
      ['보고서 그림', '모델 출력·화면 캡처·구성도 18종', 'docs/report/figures/'],
      ['그림·시연 재현 도구', '그림 생성, 화면 캡처 자동화, 성능 측정, 보고서 생성 스크립트', 'docs/report/tools/'],
      ['본 보고서', '단계보고서 삽입용 Word 문서', 'docs/report/CFD_보기모드_개발결과_단계보고서.docx'],
    ],
    [1800, 4538, 3300],
  ),
  note('현재 모든 변경은 저장소에 **커밋되지 않은 상태**이다(브랜치 `develop_csv_test`).', 'EAF2FB', '7FA6D6'),
);

// 부록
add(
  new Paragraph({ pageBreakBefore: true, children: [] }),
  H1('부록 A. 조작 안내'),
  ...table(
    '조작 안내',
    ['동작', '방법'],
    [
      ['보기 모드 전환', '뷰어 우측 상단 [기본 | CFD] (5~9번 화면)'],
      ['레이어 켜기·끄기', 'CFD 모드 우측 상단 레이어 패널의 체크박스'],
      ['벡터 밀도', '\'벡터\' 아래 밀도 슬라이더 (1~5)'],
      ['수면 투명도', '\'수면\' 아래 투명도 슬라이더'],
      ['단면 종류·위치', '\'단면\' 아래 XZ(A–A′) / YZ(B–B′) 버튼, 위치 슬라이더, \'연동\' 버튼'],
      ['클릭 프로브', 'CFD 모드에서 하상 클릭 → 좌상단 카드, ✕로 닫기'],
      ['카메라 프리셋', 'T: 평면, R: 기본 시점 (기존 단축키)'],
      ['화면 캡처', 'P 키 (CFD 모드는 파일명에 `_CFD`)'],
    ],
    [2600, 7038],
  ),
  H1('부록 B. 주요 설정값'),
  P('입자 수, 벡터 밀도 등 성능에 영향을 주는 값은 `src/constants/cfdSettings.ts`에 모아 두었다.'),
  ...table(
    '설정값',
    ['설정', '기본값', '설명'],
    [
      ['pathlineCount', '700', '유선 입자 수'],
      ['pathlineTail', '14', '유선 꼬리 길이(점 개수)'],
      ['pathlineMaxAgeSeconds', '14', '입자 최대 수명(재생 초)'],
      ['pathlineSpeedScale', '2.5', '입자 이동 배율(실험실 규모 유속이 느려 시각화용으로 확대)'],
      ['pathlineHorseshoeFraction', '0.25', '교각 전면 하상 부근에 투입하는 입자 비율'],
      ['pathlineWakeFraction', '0.25', '교각 바로 뒤에 투입하는 입자 비율'],
      ['vectorMaxCount', '3000', '벡터 글리프 최대 개수'],
      ['vectorDensity (1~5)', '3', '벡터 밀도 기본값'],
      ['vectorHeightFraction', '0.5', '벡터가 놓이는 수심 비율'],
      ['surfaceOpacityDefault', '0.92', '수면 기본 불투명도'],
      ['surfaceDisturbanceGain', '6', '자유수면 교란 시각화 과장 배율'],
    ],
    [3300, 1500, 4838],
    { center: [1] },
  ),
  H1('부록 C. 그림·시연 재현 방법'),
  P('보고서의 화면 그림은 다음 순서로 다시 만들 수 있다. 시연용 CSV는 파일명이 케이스 이름(`s01`)이어야 S01 시나리오가 적용된다.'),
  BUL('1) `npx vite --port 5199`로 앱 실행, 시연용 CSV를 `csv/s01.csv`로 준비'),
  BUL('2) `node docs/report/tools/capture_screens_a.mjs <출력 폴더>`, `capture_screens_b.mjs`로 화면 캡처(Chrome 헤드리스 자동 조작)'),
  BUL('3) 합성 유동장 출력은 `SyntheticCfdFlow`를 샘플링해 JSON으로 덤프한 뒤 `make_figures.py`가 그림으로 변환'),
  BUL('4) `python docs/report/tools/make_figures.py <덤프 JSON> <캡처 상위 폴더> docs/report/figures`'),
  BUL('5) 프레임율은 `measure_fps.mjs`로 측정'),
);

// ══════════════════════════════════════════════════════════════════
const doc = new Document({
  creator: 'AIScour',
  title: '3D 세굴 가시화 CFD 보기 모드 개발 결과',
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: NAVY },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: '2B3A4A' },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: FONT, color: '2B3A4A' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } },
      ] },
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, right: 1134, bottom: 1200, left: 1134 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A9B4C0', space: 4 } },
            children: [new TextRun({ text: '3D 세굴 가시화 — CFD 보기 모드 개발 결과', font: FONT, size: 17, color: GRAY })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: ['- ', PageNumber.CURRENT, ' -'], font: FONT, size: 18, color: GRAY })],
          })],
        }),
      },
      children: body,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('written', OUT, buf.length, 'bytes; tables', tableNo, 'figures', figNo);
});
