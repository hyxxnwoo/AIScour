// 단계보고서 삽입용 '화면 10종' Word 문서 생성. 사용: node build_screens.js <screens 폴더> <출력 docx>
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, LevelFormat, VerticalAlign,
} = require('docx');

const DIR = process.argv[2];
const OUT = process.argv[3];
const FONT = { ascii: 'Malgun Gothic', hAnsi: 'Malgun Gothic', eastAsia: 'Malgun Gothic', cs: 'Malgun Gothic' };
const MONO = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Malgun Gothic', cs: 'Consolas' };
const CONTENT_W = 9638; // A4, 좌우 여백 2cm
const SUMMARY = JSON.parse(fs.readFileSync(path.join(DIR, 'scour_summary.json'), 'utf-8'));
const NAVY = '1F3A5F';
const GRAY = '5A6672';
const ORANGE = 'E8700A';

function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: MONO, ...base, size: (base.size || 21) - 2, color: '8A2B2B' }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

const P = (text, o = {}) => new Paragraph({ children: runs(text, o.run || {}), spacing: { after: 110, line: 330 }, alignment: o.align || AlignmentType.JUSTIFIED, keepNext: o.keepNext });
const H1 = (t, o = {}) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: o.pageBreak, children: [new TextRun({ text: t, font: FONT })], keepNext: true });
const H2 = (t, o = {}) => new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: o.pageBreak, children: [new TextRun({ text: t, font: FONT })], keepNext: true });
const BUL = (text) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(text), spacing: { after: 60, line: 320 } });

const border = { style: BorderStyle.SINGLE, size: 4, color: 'A9B4C0' };
const borders = { top: border, bottom: border, left: border, right: border };
let tableNo = 0;
let figNo = 0;

function cell(text, w, o = {}) {
  const paras = String(text).split('\n').map((line) => new Paragraph({
    alignment: o.align || AlignmentType.LEFT, spacing: { after: 20, line: 280 },
    children: runs(line, { size: o.size || 18, bold: o.bold, color: o.color }),
  }));
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 }, children: paras,
  });
}

function caption(kind, text, o = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: kind === '표' ? 140 : 40, after: kind === '표' ? 70 : 140 },
    keepNext: kind === '표',
    children: [
      new TextRun({ text: `${kind} ${o.label ?? (kind === '표' ? ++tableNo : ++figNo)}. `, bold: true, font: FONT, size: 18, color: NAVY }),
      new TextRun({ text, font: FONT, size: 18, color: '222B36' }),
    ],
  });
}

function table(title, header, rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const out = [];
  if (title) out.push(caption('표', title));
  out.push(new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, widths[i], { fill: 'DCE6F1', bold: true, align: AlignmentType.CENTER, size: o.size })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], { size: o.size, align: o.center && o.center.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT, fill: o.fillFirst && i === 0 ? 'F3F6FA' : undefined, bold: o.boldFirst && i === 0 })) })),
    ],
  }));
  if (!o.noSpacer) out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  return out;
}

function note(text, fill = 'FFF6DD', edge = 'E0B93C') {
  const b = { style: BorderStyle.SINGLE, size: 6, color: edge };
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
      rows: [new TableRow({ children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA }, borders: { top: b, bottom: b, left: b, right: b },
        shading: { fill, type: ShadingType.CLEAR, color: 'auto' }, margins: { top: 90, bottom: 90, left: 150, right: 150 },
        children: text.split('\n').map((t) => new Paragraph({ spacing: { after: 40, line: 300 }, children: runs(t, { size: 19 }) })),
      })] })],
    }),
    new Paragraph({ spacing: { after: 100 }, children: [] }),
  ];
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function image(file, widthPx, text) {
  const full = path.join(DIR, file);
  const { w, h } = pngSize(full);
  return new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 60, after: 30 },
    children: [new ImageRun({ type: 'png', data: fs.readFileSync(full), transformation: { width: widthPx, height: Math.round((widthPx * h) / w) }, altText: { title: text, description: text, name: file } })],
  });
}

// ── 화면 한 장(제목, 개요 표, 번호 마커 캡처, 구성 설명 표) ──────────────────
function infoTable(pairs, noteText) {
  const W = [1250, 3569, 1250, 3569];
  const lab = (t, w) => cell(t, w, { fill: 'F3F6FA', bold: true, size: 16 });
  const val = (t, w, span) => {
    const c = cell(t, w, { size: 16 });
    return c;
  };
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i];
    const b = pairs[i + 1];
    rows.push(new TableRow({ cantSplit: true, children: [lab(a[0], W[0]), val(a[1], W[1]), lab(b[0], W[2]), val(b[1], W[3])] }));
  }
  if (noteText) {
    rows.push(new TableRow({
      cantSplit: true,
      children: [
        lab('데이터 구분', W[0]),
        new TableCell({
          width: { size: W[1] + W[2] + W[3], type: WidthType.DXA }, columnSpan: 3, borders, verticalAlign: VerticalAlign.CENTER,
          margins: { top: 50, bottom: 50, left: 90, right: 90 },
          children: [new Paragraph({ spacing: { after: 20, line: 280 }, children: runs(noteText, { size: 16 }) })],
        }),
      ],
    }));
  }
  return [new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: W, rows }), new Paragraph({ spacing: { after: 60 }, children: [] })];
}

function screenSection(s) {
  const out = [];
  out.push(H1(`${s.title}`, { pageBreak: true }));
  out.push(...infoTable([['화면 번호', s.id], ['접근 경로', s.route], ['사용 데이터', s.data], ['용도', s.purpose]], s.note));
  out.push(image(`${s.file}.png`, s.imgW || 600, s.title));
  out.push(caption('그림', `${s.title} (번호는 아래 구성 설명 표와 대응)`, { label: s.fig }));
  out.push(...table(null, ['번호', '구성 요소', '설명'], s.items.map((it, i) => [String(i + 1), it[0], it[1]]), [520, 1750, 7368], { size: 16, center: [0], noSpacer: true }));
  return out;
}

// ══════════════════════════════════════════════════════════════════
const SCREENS = [
  {
    id: '1', fig: '1', file: 's01_login', title: '화면 1. 로그인',
    route: '#s/1 (미인증 상태의 시작 화면)', data: '없음 (정적 소개 문구)', purpose: '대시보드 진입 인증',
    items: [
      ['서비스 소개', '\'교량 세굴 3D 시각화\' 제목과, FLOW-3D 시뮬레이션 결과를 불러와 유속·세굴심·유동장 데이터를 3D로 시각화하고 교각 안전성을 검토한다는 안내문.'],
      ['현황 요약 카드', '해석 케이스 200 case, 세굴 / 기초 근입 3.42 / 5.2 m, 교각 구성 기본 3 · 최대 5. 소개용 고정 수치이며 진행 막대가 함께 표시된다.'],
      ['로그인 카드', '아이디·비밀번호 입력(비밀번호 표시/숨김 전환)과 데모 계정 안내 문구.'],
      ['로그인 버튼', '인증에 성공하면 세션에 인증 상태를 저장하고 케이스 관리(화면 2)로 이동한다. 새로 고침해도 같은 세션에서는 로그인 화면을 건너뛴다.'],
    ],
  },
  {
    id: '2', fig: '2', file: 's02_cases', imgW: 480, title: '화면 2. 케이스 관리',
    route: '#s/2 · 상단 메뉴 \'케이스\' > \'케이스 관리\'', data: '앱 내장 모의 케이스 DB(100건) + 이번 CSV로 발급된 케이스 A-131', purpose: '해석 케이스 목록 조회·선택·진입',
    items: [
      ['전역 내비게이션', '케이스 / 시뮬레이션 뷰어 / 경보·SOP / 리포트 메뉴. 우측에 현재 케이스 라벨(Case A-131 · 원기둥 D=0.06 m · 교각 3), 최고 등급 배지(심각 · P1), 사용자, 로그아웃. 모든 화면에 공통이다.'],
      ['요약 차트 3종', '상태(검증완료·해석중·대기 도넛), 등급 분포(관심·주의·경계·심각 막대, 세굴 미산출 건은 제외), 유량·세굴 산점도. 칩·막대·점을 누르면 목록이 필터링되거나 케이스가 선택된다.'],
      ['새 해석 시작', '조건 설정(화면 4)으로 이동. CSV는 조건 설정에서 올리고 \'적용하고 결과 보기\' 시 케이스 ID가 발급된다는 안내가 함께 표시된다.'],
      ['필터', '상태 칩(전체·검증완료·해석중·대기·QA 오류)과 교각 형상, 직경, 유량, 하상·퇴적물 입경, 등급, 상태 조건 선택 후 검색.'],
      ['케이스 목록', '케이스 ID, 교각 형상, 직경, 유량, 하상·퇴적물 입경, 최대 세굴(등급 배지), 상태, 갱신 일시, 동작(뷰어 진입·진행률·오류). 첫 행 A-131이 이번 CSV 적용으로 발급된 케이스(해석중, 선택됨)이다.'],
      ['선택 케이스 요약', '형상, 직경, 유량, 하상·퇴적물 입경, 기수, 근입 기준과 해석 진행 안내. \'선택 케이스 뷰어에서 열기\', \'CSV 내보내기\' 버튼.'],
      ['페이지 이동', '15페이지 중 이동.'],
    ],
    note: '목록·요약 차트의 수치는 앱에 내장된 **모의 데이터**이다. 이번 시연에서 CSV를 적용하면 케이스 A-131이 추가되어 선택 상태가 된다.',
  },
  {
    id: '3', fig: '3', file: 's03_data_pipeline', title: '화면 3. 데이터 연동 현황',
    route: '#s/3 · 상단 메뉴 \'케이스\' > \'데이터 연동 현황\'', data: '앱 내장 모의 파이프라인 목록(32건)', purpose: 'CSV 처리 단계별 현황과 품질 검증 지표 확인',
    items: [
      ['처리 파이프라인', '업로드 → 파싱 → 경량화·변환 → 품질 검증 → 서비스 반영의 5단계별 건수와, 완료·처리중·경고·오류·대기 상태 칩. 단계·칩을 누르면 목록이 필터링된다.'],
      ['CSV 파일별 처리 현황', '파일명, 연결 케이스, 업로드 일시, 크기, 처리 단계(5점 진행 표시), 결과(완료·경고·오류·처리중·대기), 처리 내용.'],
      ['품질 검증 지표', '자동화율, 지형 맞춤 오차(NRMSE), 물리 제약 통과율, 텐서 품질 점수와 각각의 목표 기준. QA(품질 보증)·QC(품질 관리) 설명이 함께 있다.'],
      ['업로드 안내', 'CSV 업로드는 조건 설정 화면에서 한다는 안내와 이동 링크.'],
      ['페이지 이동', '연동 DB 32건을 3페이지로 나누어 표시.'],
    ],
    note: '파일 목록과 지표는 앱에 내장된 **모의 데이터**이다(이번 시연 CSV가 목록에 추가되지는 않는다).',
  },
  {
    id: '4', fig: '4', file: 's04_condition', title: '화면 4. 조건 설정 (CSV 업로드·파싱)',
    route: '#s/4 · 상단 메뉴 \'시뮬레이션 뷰어\' > \'조건 설정\'', data: '시연용 CSV(s01.csv) 실제 업로드·파싱', purpose: '결과 CSV 선택, 파싱, 3D 장면 생성',
    items: [
      ['케이스 선택', '시뮬레이션 적용 전에는 기존 케이스를 고르거나, CSV 적용 후 발급되는 ID를 쓴다. 처리 현황은 데이터 연동 화면에서 확인한다는 안내.'],
      ['CSV 3단계 흐름', 'CSV 선택 → CSV 파싱 → 결과 보기. 완료된 단계에는 체크(✓)가 표시된다.'],
      ['CSV 작업 버튼', 'CSV 선택, 선택 요약(기둥 3개 · 교량 현수교 · CSV 1개: s01.csv), 파싱 결과(171×151 격자 · 프레임 13개 · 교각 3개(P1…P3)), CSV 파싱, 데이터 확인, 적용하고 결과 보기.'],
      ['유체 필드 미리보기', '유속 X·Y·Z, 하상 변화(scrdif) 선택, \'지형 위 수면\'과 높이 슬라이더, 유체 추적 입자 선택.'],
      ['3D 미리보기', '적용 전 기본 장면(수조, 교량, 교각). \'적용하고 결과 보기\'를 누르면 CSV의 하상 변화로 교체된다.'],
      ['안내 메시지', '\'CSV 파싱이 끝났습니다. 조건을 확인한 뒤 「적용하고 결과 보기」를 누르세요.\''],
      ['재생 컨트롤', '적용 전에는 잠겨 있고 \'「적용하고 결과 보기」 후 재생\' 문구를 표시한다.'],
    ],
  },
  {
    id: '5', fig: '5', file: 's05_viewer', imgW: 520, title: '화면 5. 3D 세굴 가시화',
    route: '#s/5 · \'시뮬레이션 뷰어\' > \'3D 세굴 가시화\'', data: '시연용 CSV (시점 t = 1800 s, 마지막 프레임)', purpose: '세굴 하상·교각 등급을 3D로 확인',
    items: [
      ['케이스 조건 요약', 'S01 기준조건(하상·퇴적물 입경 0.385 mm, 수심 0.15 m, 유속 0.25 m/s, 기둥 간격 0.27 m, 하단부 정사각), 퇴적 스케일(×1 실제 비율), \'교각 주변만 표시\' 옵션.'],
      ['하상 변화 컨트롤', '하상 변화(scrdif) 표시와 현재 시점(t = 1800 s · 시점 13), \'지형 위 수면\' 표시와 높이 슬라이더.'],
      ['표시 설정', '배경색, 유체 단면 불투명도(0.92).'],
      ['3D 장면', '교량·교각(기둥 색은 현재 등급색: P1 빨강, P2 주황, P3 노랑), 세굴이 반영된 하상, 수면. 마우스로 회전·확대하고 교각을 눌러 선택한다.'],
      ['하상 변화 범례', '파랑 = 세굴, 베이지 = 변화 없음, 황토 = 퇴적. 현재 값과 범위를 표시한다.'],
      ['보기 모드 토글', '[기본 | CFD] 전환(이번 개발). 이 화면은 기본 모드이며 CFD 모드는 부록 A에 있다.'],
      ['카메라 뷰', '카메라 프리셋 접이식 패널(Reset · Top · Side · Flow 버튼). Flow는 흐름 방향(좌→우) 시점이다.'],
      ['교각별 세굴 모니터', '교각별 등급 배지와 세굴심(P1 0.09 m · 여유 0 %, P2 0.06 m · 28 %, P3 0.04 m · 48 %), 등급 구간 막대, 세굴 진행 미니 그래프. 항목을 누르면 3D의 해당 교각과 연동된다.'],
      ['세굴심 범례', '세굴심(scrdif) 색 그라디언트와 분포 히스토그램.'],
      ['타임라인 컨트롤', '처음 / −30 s / 재생 / +30 s / 끝 버튼, 시간 슬라이더(1800.0 s / 1800.0 s), 배속, 스텝(30 s).'],
    ],
  },
  {
    id: '5-1', fig: '5-1', file: 's05b_scour_deposit', title: '화면 5-1. 세굴·퇴적 확인 (수면 숨김)',
    route: '#s/5 · \'지형 위 수면\' 해제 + 퇴적 스케일 ×4', data: '시연용 CSV (t = 1800 s)', purpose: '깎인 곳(세굴)과 쌓인 곳(퇴적)의 위치 확인',
    items: [
      ['세굴 구덩이 (적색 원)', '교각 기초(하단부) 둘레의 하상이 깎여 구덩이가 생긴 곳. 교각별 세굴심은 P1 0.09 m, P2 0.06 m, P3 0.04 m로 P1이 가장 깊다(우측 교각별 세굴 모니터와 같은 값).'],
      ['퇴적 둔덕 (청색 원)', '교각 하류측(오른쪽, 흐름 방향)에 모래가 쌓여 솟은 둔덕. 이 시연 데이터에서 최대 약 +0.013 m.'],
      ['퇴적 스케일', '세굴·퇴적의 높이 변화를 ×1 / ×2 / ×4배로 과장해 보는 선택. 이 화면은 ×4이며, 실제 비율(×1)과의 비교는 화면 5-3에 있다.'],
      ['지형 위 수면', '기본은 켜져 있어 수면이 하상을 덮는다. 체크를 해제하면 수면이 사라져 하상의 깎인 곳·쌓인 곳이 그대로 보인다.'],
      ['하상 변화 범례', '파랑 = 세굴, 베이지 = 변화 없음, 황토 = 퇴적. 현재 시점의 값과 범위를 표시한다.'],
      ['세굴심 범례', '세굴심 색 그라디언트와 분포 히스토그램.'],
    ],
    note: '세굴·퇴적 형상은 **시연용 합성 CSV**의 값이며 FLOW-3D 해석 결과가 아니다. ×4는 높이를 4배로 과장한 표현이므로 실제 깊이는 교각별 세굴 모니터의 수치로 읽는다.',
  },
  {
    id: '6', fig: '6', file: 's06_plan_section', title: '화면 6. 평면 · 단면',
    route: '#s/6 · \'시뮬레이션 뷰어\' > \'평면 · 단면\'', data: '시연용 CSV (t = 1800 s)', purpose: '평면 위치와 단면별 하상 변화 확인',
    items: [
      ['평면·단면 안내 카드', 'TOP(평면 시점) 표시, A–A′ 종단 / B–B′ 횡단 전환 버튼, 조작 안내(그래프에 마우스를 올리면 단면선 표시, B–B′ 모드에서 교각 클릭).'],
      ['평면 시점', '수조를 위에서 본 화면에 교각 P1–P3 마커와 단면선(A–A′ 점선)을 겹쳐 표시한다.'],
      ['단면 그래프', '\'단면 A–A′ · 흐름 방향 종단 (P2 관통)\'. P1/P2/P3 선택, 초기 하상(t = 0 s), 비교 시점(t = 450 s)과 현재(t = 1800 s) 하상선, 세굴(−)·퇴적(+) 구간, 기초 바닥(−0.08 m) 기준선.'],
      ['단면 지표 5종', '최대 세굴 깊이(P2) 0.06 m, 단면 최대 퇴적 0.013 m, 세굴폭 1.60 m, 세굴공 단면적 0.004 m², 기초 저면까지 여유 0.02 m (28 %).'],
      ['교각별 세굴 모니터', '화면 5와 같은 우측 패널. 교각 선택이 단면과 연동된다.'],
      ['타임라인 컨트롤', '이 화면에서는 하단 전체 폭으로 배치된다.'],
    ],
  },
  {
    id: '7', fig: '7', file: 's07_grade_bed', title: '화면 7. 등급 · 하상',
    route: '#s/7 · \'시뮬레이션 뷰어\' > \'등급 · 하상\' (설계 목업의 \'셀 상세\'에 해당)', data: '시연용 CSV (t = 1800 s)', purpose: '교각 위험 등급 기준과 하상 상태 확인',
    items: [
      ['교각 등급 범례', '세굴 깊이 온도계 막대, 교각 칩(P1 심각 · P2 경계 · P3 주의), 4등급 기준표: 관심(Blue) 잔여 여유 70 % 이상·0.02 m 미만 / 주의(Yellow) 40–70 %·0.02–0.05 m / 경계(Orange) 20–40 %·0.05–0.06 m / 심각(Red) 20 % 미만·0.06 m 이상. 등급·교각 칩을 누르면 3D와 교각 라벨이 연동된다. 경계값은 \'잠정\' 표시.'],
      ['3D 장면', '교각 기둥이 현재 등급색으로 칠해지고, 하단부(footing)와 세굴 하상이 함께 보인다.'],
      ['교각별 세굴 모니터', '교각별 세굴심·여유율·등급 배지.'],
      ['세굴심 범례', '하상 변화 색 범례와 분포.'],
      ['타임라인 컨트롤', '시점 이동·재생.'],
    ],
  },
  {
    id: '8', fig: '8', file: 's08_timeline', title: '화면 8. 타임라인 · 시계열',
    route: '#s/8 · \'시뮬레이션 뷰어\' > \'타임라인 · 시계열\'', data: '시연용 CSV (0–1800 s 전 구간)', purpose: '교각별 세굴 진행과 등급 도달 시각 확인',
    items: [
      ['3D 장면', '상단에 같은 시점의 3D 장면을 유지한다.'],
      ['교각별 표시 세굴심 시계열', 'P1/P2/P3 선택, 0–1800 s 세굴 진행 곡선, 등급 기준선(주의 0.02 m · 경계 0.05 m · 심각 0.06 m), 기초 근입 0.08 m 선, 현재 시각선. 그래프를 끌거나 눌러 시점을 이동한다.'],
      ['등급 구간(간트)', '교각별로 시간 축에 따른 등급 구간을 색 막대로 표시한다.'],
      ['등급 도달 시각 표', '교각별로 주의·경계·심각에 처음 도달한 시각과 평형 세굴심. P1: 5분 · 7분 30초 · 10분 / 평형 0.09 m, P2: 5분 · 15분 · 도달 안 함 / 0.06 m, P3: 7분 30초 · 도달 안 함 · 도달 안 함 / 0.04 m. \'해석 길이 1800 s · 잠정 경계 기준\' 주석 포함.'],
      ['교각별 세굴 모니터', '우측 패널.'],
      ['타임라인 컨트롤', '하단 전체 폭으로 배치.'],
    ],
  },
  {
    id: '9', fig: '9', file: 's09_risk', title: '화면 9. 위험 판정',
    route: '#s/9 · \'시뮬레이션 뷰어\' > \'위험 판정\'', data: '시연용 CSV (t = 1800 s)', purpose: '종합 위험 등급과 교각별 위험 정보, 표준 조치 안내',
    items: [
      ['종합 위험 등급', '가장 위험한 교각 기준 등급(심각, Level 4/4 · Red), 잔여 여유율 반원 게이지(P1 여유 0 %), 표준 조치(통행 제한 및 긴급 보강 검토), \'대응 절차(SOP) 보기\' 버튼(경보·SOP 화면으로 이동).'],
      ['교각별 위험 정보', '교각별 등급과 세굴심(P1 심각 0.09 m, P2 경계 0.06 m, P3 주의 0.04 m), 잔여 여유율 링 게이지(0 % · 28 % · 48 %), 세굴 추이 미니 그래프, 다음 등급 도달 예측(P2: 심각 도달 안 함), 평형 세굴심 막대. 잠정 기준 표시.'],
      ['3D 장면', '교각이 등급색으로 표시된 3D 장면.'],
      ['세굴심 범례', '하상 변화 색 범례.'],
      ['타임라인 컨트롤', '시점 이동·재생.'],
    ],
  },
  {
    id: '10', fig: '10', file: 's10_alert_sop', imgW: 480, title: '화면 10. 경보 · SOP',
    route: '#s/10 · 상단 메뉴 \'경보 · SOP\'', data: '앱 내장 모의 경보·이력 + 현재 케이스(P2 · A-131 · t = 1800 s) 연동', purpose: '경보 선택, SOP 조치 체크, 대응 이력 관리',
    items: [
      ['요약 지표', '경보 · SOP 대응 센터 제목과 \'실시간 연동\' 배지, 진행 18 · 종료 10 · SOP 완료 50 %(2/4 단계) · 상태 \'조치 진행\'(심각). 부제에 현재 교각·케이스·시점이 표시된다.'],
      ['3단계 진행 안내', '① 경보 선택 → ② SOP 조치 → ③ 경보 종료.'],
      ['경보 목록 (STEP 1)', '전체 28 · 진행중 18 · 종료 10 집계와 도넛, 경보 카드(등급, 교각, 발령 시각, 조치 상태, 케이스, 여유율). 목록 페이지 이동.'],
      ['선택 경보', '선택한 경보의 등급·조치 상태, 교각·케이스, 발령 시각·담당, 세굴 깊이·기초 근입·판정, 잔여 여유율 게이지, \'경보 종료(SOP 완료 후)\' 버튼.'],
      ['SOP 조치 (STEP 2)', '등급별 체크리스트: 관심 \'정상 모니터링 유지\', 주의 \'점검 주기 단축(주 1회 → 일 1회)\', 경계 \'현장 긴급 점검 실시\'·\'관리주체 보고\', 심각 \'통행 제한 및 긴급 보강 검토\'(심각 등급 도달 시 자동 활성). 항목마다 메모·첨부·완료 처리·취소 버튼이 있고 처리 결과가 이력에 자동 기록된다. 진행률 2/4.'],
      ['대응 이력', '최근 6건의 대응 이력을 일자별 타임라인으로 표시.'],
      ['등급 · 표준 조치 (STEP 3)', '관심(Blue) 정상 모니터링 유지, 주의(Yellow) 점검 주기 단축, 경계(Orange) 현장 긴급 점검 실시, 심각(Red) 통행 제한 및 긴급 보강 검토. 계획서 기준 대응 가이드.'],
    ],
    note: '경보 목록·선택 경보·대응 이력은 앱에 내장된 **모의 데이터**이며, 상단의 \'교각 P2 · A-131 · t = 1800 s\'와 \'실시간 연동\'은 현재 로드된 케이스에서 오는 값이다.',
  },
];

const APPENDIX = [
  {
    fig: 'A-1', file: 'a01_cfd_pathlines', title: '부록 A-1. CFD 보기 모드 — 유선과 자유수면 (3D 세굴 가시화)',
    route: '#s/5 · 보기 모드 [CFD]', data: '시연용 CSV + 합성 유동장(목업)', purpose: '해석 결과 검토용 후처리 표현',
    items: [
      ['보기 모드 토글', '[CFD]가 선택된 상태. 선택은 브라우저에 저장되고 5~9번 화면에서 유지된다.'],
      ['레이어 패널', '하상 컨투어·유선·수면이 켜짐(교량은 끔). 유속에 의존하는 레이어에는 합성 유동장일 때 \'목업\' 태그가 붙고, 하단에 \'유동장: 목업(합성 유동장)\'을 표시한다.'],
      ['3D 장면', 'CFD 하상 컬러(세굴 적색 / 퇴적 청색)와 유속 크기로 색을 칠한 유선, 교란이 있는 반투명 수면. 교각·하단부 표면을 따라 흐름이 갈라진다.'],
      ['유속 컬러바', '유속(m/s) 0~최대 범위. 합성 유동장일 때 \'목업\' 표시.'],
      ['시각·프레임 오버레이', 't = 시각 s / Frame 현재 / 전체.'],
      ['좌표축', 'X 흐름, Y 횡단, Z 연직. 카메라를 돌리면 함께 회전한다.'],
    ],
  },
  {
    fig: 'A-2', file: 'a02_cfd_bed_isolines', title: '부록 A-2. CFD 보기 모드 — 하상 컨투어와 등심선 (평면 시점)',
    route: '#s/5 · 보기 모드 [CFD] · 평면 시점(T)', data: '시연용 CSV (t = 1800 s)', purpose: '하상 변화의 연속 분포와 등심선 확인',
    items: [
      ['레이어 패널', '하상 컨투어와 등심선이 켜진 상태(유선·수면·교량은 끔).'],
      ['3D 장면(평면 시점)', '교각 주변의 적색 세굴 구덩이와 하류측 청색 퇴적, 등심선과 값 라벨(예: -0.02 m).'],
      ['세굴심 컬러바', '기존 범례가 CFD 색(적-백-청)으로 바뀐다.'],
      ['시각·프레임 오버레이', '현재 시각과 프레임.'],
      ['좌표축', '평면 시점에서의 축 방향.'],
    ],
  },
  {
    fig: 'A-3', file: 'a03_cfd_cutplane', title: '부록 A-3. CFD 보기 모드 — 연직 단면',
    route: '#s/5 · 보기 모드 [CFD] · 단면 레이어', data: '시연용 CSV + 합성 유동장(목업)', purpose: '유속 단면 분포와 면내 벡터 확인',
    items: [
      ['레이어 패널', '단면 레이어를 켜면 종단 XZ(A–A′) / 횡단 YZ(B–B′) 선택, 위치 슬라이더, \'연동\' 버튼이 나타난다. \'연동\'은 평면·단면 화면의 단면선(선택 교각)에 위치를 맞춘다.'],
      ['3D 장면', '교각 중심을 지나는 종단 단면에 유속 크기 컨투어와 면내 벡터가 그려지고, 교각 내부는 투명하게 비어 있다.'],
      ['유속 컬러바', '유속(m/s), \'목업\' 표시.'],
    ],
  },
];

// ══════════════════════════════════════════════════════════════════
const body = [];
const add = (...xs) => xs.flat().forEach((x) => body.push(x));

add(
  new Paragraph({ spacing: { before: 1700, after: 200 }, children: [new TextRun({ text: '연구과제 단계보고서 삽입 자료', font: FONT, size: 24, color: GRAY })] }),
  new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 8 } }, children: [new TextRun({ text: '시뮬레이션 대시보드 화면 10종', font: FONT, size: 54, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: '교량 세굴 3D 시각화 — 화면별 구성과 기능', font: FONT, size: 36, bold: true, color: '2B3A4A' })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: '로그인 · 케이스 관리 · 데이터 연동 · 조건 설정 · 3D 세굴 가시화 · 평면/단면 · 등급/하상 · 타임라인/시계열 · 위험 판정 · 경보 SOP', font: FONT, size: 21, color: GRAY })] }),
  new Paragraph({ spacing: { before: 1000, after: 60 }, children: [new TextRun({ text: '작성일  2026. 10. 22.', font: FONT, size: 21 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: '캡처 환경  Chrome 헤드리스, 1920×1200, 개발 서버 구동 화면', font: FONT, size: 21 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: '구성  개요 · 화면 10종(화면당 1쪽) + 세굴·퇴적 화면 3쪽 · 부록(CFD 모드 3종, 점검 사항)', font: FONT, size: 21 })] }),
);

// 개요
add(
  H1('1. 개요', { pageBreak: true }),
  P('본 자료는 교량 세굴 3D 시각화 대시보드의 화면 10종을 실제 앱에서 캡처하고, 화면마다 구성 요소와 기능을 번호로 대응시켜 정리한 것이다. 화면 번호와 이름은 앱의 화면 라우터(`#s/1`~`#s/10`)와 같다.'),
  H2('1.1 화면 구성'),
  ...table('화면 10종 목록', ['번호', '화면', '접근 경로', '데이터 출처'], [
    ['1', '로그인', '시작 화면(미인증)', '없음'],
    ['2', '케이스 관리', '케이스 > 케이스 관리', '모의 케이스 DB + 현재 케이스'],
    ['3', '데이터 연동 현황', '케이스 > 데이터 연동 현황', '모의 파이프라인 목록'],
    ['4', '조건 설정', '시뮬레이션 뷰어 > 조건 설정', '시연용 CSV 실제 업로드'],
    ['5', '3D 세굴 가시화', '시뮬레이션 뷰어 > 3D 세굴 가시화', '시연용 CSV'],
    ['5-1', '세굴·퇴적 확인(수면 숨김)', '3D 세굴 가시화 + 수면 해제, 퇴적 스케일 ×4', '시연용 CSV'],
    ['5-2', '세굴·퇴적 분포도', '데이터 도면(앱 계산값)', '시연용 CSV'],
    ['5-3', '시간 경과·단면·스케일 비교', '데이터 도면 + 앱 화면', '시연용 CSV'],
    ['6', '평면 · 단면', '시뮬레이션 뷰어 > 평면 · 단면', '시연용 CSV'],
    ['7', '등급 · 하상', '시뮬레이션 뷰어 > 등급 · 하상', '시연용 CSV'],
    ['8', '타임라인 · 시계열', '시뮬레이션 뷰어 > 타임라인 · 시계열', '시연용 CSV'],
    ['9', '위험 판정', '시뮬레이션 뷰어 > 위험 판정', '시연용 CSV'],
    ['10', '경보 · SOP', '경보 · SOP', '모의 경보 + 현재 케이스 연동'],
  ], [800, 2400, 3700, 2738], { center: [0] }),
  P('**5-1~5-3**은 이 시뮬레이션의 핵심인 \'깎인 곳(세굴)과 쌓인 곳(퇴적)\'을 따로 보여 주는 화면이다. 기본 화면 5는 수면이 하상을 덮고 있어 세굴·퇴적이 잘 보이지 않으므로, 수면을 숨기고 확대한 화면(5-1)과 하상 변화 분포도(5-2, 5-3)를 추가하였다.'),
  P('설계 목업(`SCDT_파일럿DT_화면10종_v2`)의 7번 화면은 \'셀 상세\'이며, 구현된 앱에서는 \'등급 · 하상\'으로 제공된다. 상단 메뉴에서 \'시뮬레이션 뷰어\'는 화면 4~9를 묶는 메뉴이다.'),
  H2('1.2 캡처 조건과 데이터', { pageBreak: true }),
  ...table('캡처 조건', ['항목', '내용'], [
    ['환경', 'Chrome 헤드리스(DevTools Protocol 자동 조작), 소프트웨어 렌더링(SwiftShader), 해상도 1920×1200, 로컬 개발 서버'],
    ['계정·상태', '데모 계정(admin)으로 로그인한 세션. 화면 1만 미인증 상태에서 캡처'],
    ['시점·카메라', '화면 5~9는 마지막 시점(t = 1800 s)에서 재생을 멈추고 기본 카메라(R)로 캡처. 보기 모드는 기본'],
    ['콘솔', '캡처 전 과정에서 브라우저 콘솔 오류·경고 없음'],
    ['번호 마커', '주황색 번호와 윤곽선은 캡처 후 DOM에서 읽은 영역 좌표로 겹쳐 그린 것이며, 원본 캡처는 `docs/report/screens/raw/`에 있다'],
  ], [1800, 7838]),
  ...table('시연용 입력 데이터 (화면 4~9)', ['항목', '내용'], [
    ['성격', '경량화 CSV 형식(`x_m, y_m, t0000s…`)으로 직접 만든 **합성 데이터**이며 FLOW-3D 해석 결과가 아니다. 파일명 `s01.csv`로 시나리오 S01(유속 0.25 m/s, 수심 0.15 m, 기둥 간격 0.27 m, 정사각 하단부)이 적용된다'],
    ['규모', '2 cm 간격 6,536점, 0~1800 s 150 s 간격 13프레임. 앱이 1 cm 격자(171×151)로 재표본화하고 교각 3개(P1…P3)를 검출'],
    ['세굴 형상', '교각 3개 주위 가우시안 세굴 구덩이(진폭 P1 0.150 m, P2 0.105 m, P3 0.070 m, 시간상수 500 s)와 하류측 퇴적(최대 0.014 m), 구조물 점유 셀은 0. 교각별로 깊이를 달리해 세 등급이 모두 나타나게 함'],
    ['앱 표시 결과', 'P1 심각(세굴 0.09 m, 여유 0 %), P2 경계(0.06 m, 28 %), P3 주의(0.04 m, 48 %). 기초 근입 0.08 m 기준, 등급 경계값은 잠정(70/40/20 %)'],
  ], [1800, 7838]),
  ...note('**데이터 구분**: 화면 4~9는 위 시연용 CSV에서 계산된 값이다. 화면 2(케이스 목록)·3(데이터 연동)·10(경보 목록·이력)의 목록과 지표는 앱에 내장된 **모의 데이터**이며, 현재 케이스 연동 부분만 실제 입력에서 온 값이다. 각 화면 설명 표 아래에 해당 여부를 표시했다.'),
);

function scourPages() {
  const t1800 = SUMMARY['1800'];
  const mm = (v) => (v * 1000).toFixed(1);
  const m3 = (v) => v.toFixed(3);
  const rows = ['300', '900', '1800'].map((k) => {
    const x = SUMMARY[k];
    return [`${x.t} s`, `${m3(x.piers.P1)} m`, `${m3(x.piers.P2)} m`, `${m3(x.piers.P3)} m`, `-${mm(Math.abs(x.min))} mm`, `+${mm(x.max)} mm`];
  });
  const out = [];
  out.push(H1('화면 5-2. 세굴·퇴적 분포도 (데이터 도면)', { pageBreak: true }));
  out.push(...infoTable([['화면 번호', '5-2'], ['생성 방법', '앱이 CSV에서 만든 하상 변화 데이터를 평면 분포도로 작성'], ['사용 데이터', '시연용 CSV (t = 1800 s)'], ['용도', '깎인 곳·쌓인 곳의 범위와 크기 확인']],
    '앱 화면이 아니라 앱이 계산한 하상 변화값(1 cm 격자)을 도면으로 그린 것이다. 교각별 세굴심은 앱의 모니터와 같은 계산(`pierScourDepths`) 결과이다.'));
  out.push(image('fig_scour_map.png', 420, '세굴·퇴적 분포도'));
  out.push(caption('그림', '하상 변화 분포도(t = 1800 s). 적색 = 깎인 곳(세굴), 청색 = 쌓인 곳(퇴적). 등고선 숫자는 mm', { label: '5-2' }));
  out.push(...table('시점별 세굴·퇴적 크기', ['시점', 'P1 세굴심', 'P2 세굴심', 'P3 세굴심', '최대 세굴(격자)', '최대 퇴적(격자)'], rows, [1300, 1600, 1600, 1600, 1769, 1769], { size: 17, center: [0, 1, 2, 3, 4, 5], noSpacer: true }));
  out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  out.push(BUL('**깎인 곳**: 세 교각 모두 기초 둘레에 구덩이가 생기고 P1 > P2 > P3 순으로 깊다(교각별 세굴심은 앱 계산값, 최대 세굴은 격자 최솟값이라 서로 같지 않을 수 있다).'));
  out.push(BUL(`**쌓인 곳**: 교각 하류측 약 0.12–0.30 m 구간에 둔덕이 쌓이며 최대 +${mm(t1800.max)} mm로, 세굴에 비해 얕고 넓게 퍼진다.`));
  out.push(BUL('색 범위는 ±0.09 m로 고정해 시점·교각 간 비교가 가능하다. 퇴적은 값이 작아 옅은 청색으로 보이므로 등고선(+5, +10 mm)을 함께 표시했다.'));

  out.push(H1('화면 5-3. 시간 경과와 단면, 퇴적 스케일 비교', { pageBreak: true }));
  out.push(image('fig_scour_time.png', 600, '시간별 분포도'));
  out.push(caption('그림', '세굴·퇴적 진행(t = 300, 900, 1800 s, 같은 색 범위)', { label: '5-3a' }));
  out.push(image('fig_scour_profile.png', 600, '교각 중심선 종단 프로파일'));
  out.push(caption('그림', '교각 중심선(흐름 방향) 하상 변화 프로파일. 회색 띠는 하단부 범위, 색 칠한 부분은 t = 1800 s의 세굴(적)·퇴적(청). 중심선 한 줄의 값이라 평면 최대 세굴(교각 측면)보다 작게 보인다', { label: '5-3b' }));
  out.push(image('s05c_scale_compare.png', 600, '퇴적 스케일 비교'));
  out.push(caption('그림', '앱 화면의 퇴적 스케일 비교(수면 해제, t = 1800 s). ×1은 실제 비율이라 퇴적 둔덕이 잘 보이지 않고, ×4는 높이를 4배로 과장해 둔덕이 뚜렷하다', { label: '5-3c' }));
  out.push(BUL('세굴은 초기 300 s에 빠르게 진행하고 이후 완만해지는 시간 경과를 보인다(시연 데이터의 시간상수 500 s).'));
  out.push(BUL('퇴적 스케일은 표현만 바꾸며 교각별 세굴심·등급 계산에는 영향을 주지 않는다.'));
  return out;
}

for (const s of SCREENS) {
  add(...screenSection(s));
  if (s.id === '5-1') add(...scourPages());
}

// 부록 A
add(H1('부록 A. CFD 보기 모드 화면', { pageBreak: true }), P('3D 세굴 가시화(화면 5)의 우측 상단 [기본 | CFD] 토글로 전환하는 연구자용 보기 모드이다. 기본 모드의 화면 5~9와 같은 데이터·같은 시점을 다른 표현으로 보여 주며, 구현 내용은 별도 개발 결과 문서(`CFD_보기모드_개발결과_단계보고서.docx`)에 있다. 유동장은 해석 유속이 없어 합성 유동장(목업)이다.'));
for (const s of APPENDIX) {
  add(
    H2(s.title, { pageBreak: s !== APPENDIX[0] }),
    ...infoTable([['접근 경로', s.route], ['데이터', s.data], ['용도', s.purpose], ['화면', '3D 세굴 가시화(화면 5)']]),
    image(`${s.file}.png`, 500, s.title),
    caption('그림', `${s.title}`, { label: s.fig }),
    ...table(null, ['번호', '구성 요소', '설명'], s.items.map((it, i) => [String(i + 1), it[0], it[1]]), [520, 1750, 7368], { size: 16, center: [0] }),
  );
}

// 부록 B
add(
  H1('부록 B. 캡처 과정에서 확인한 사항', { pageBreak: true }),
  P('캡처 중 확인한 표시 문제 5건이다. 3건은 원인이 분명한 단순 결함이라 코드에서 바로잡았고, 2건은 모의 데이터·표시 반올림에 따른 것이라 수정하지 않았다.'),
  ...table('수정한 항목', ['화면', '증상', '원인 및 조치'], [
    ['9. 위험 판정', '종합 위험 등급의 반원 게이지에서 등급 색 띠가 뒤집혀 대부분 잘려 보이고, 아래 \'P1 · 여유\' 라벨이 잘림', '색 띠 경로 함수가 y축을 아래로 해석해 바늘·눈금(위쪽 반원)과 반대편에 그렸다. 띠의 각도를 뒤집어 위쪽 반원에 그리고, 라벨이 있으면 SVG 높이를 늘림(`src/viz/gauge.ts`). 시험 3건 추가'],
    ['8. 타임라인 · 시계열', '세굴심 그래프 Y축 눈금이 0.0, 0.0, 0.0 … 0.1로 표시되어 값을 읽을 수 없음', '눈금을 소수 한 자리로 고정해 둔 탓이다. 기초 근입이 0.5 m 미만이면 소수 셋째 자리까지 표시(`PierScourTimelinePanel.ts`)'],
    ['5~9 (CFD 모드)', 't · Frame 오버레이와 유속 컬러바가 하단 타임라인과 겹침, 유선이 하상을 가릴 만큼 많음', '오버레이를 타임라인 위로 올리고 유선 기본 입자 수를 1200개에서 700개로 낮춤(CFD 개발 중 수정)'],
  ], [1700, 3300, 4638], { size: 17 }),
  ...table('수정하지 않은 표시 특이사항', ['화면', '내용'], [
    ['2. 케이스 관리 / 상단 라벨', '현재 케이스의 직경이 상단 라벨에는 \'D=0.06 m\', 목록에는 \'0.1 m\'로 서로 다르게 반올림되어 표시된다(실제 값 0.0625 m).'],
    ['10. 경보 · SOP', '선택 경보 카드의 수치(세굴 깊이 3.42 m, 기초 근입 0.1 m)는 모의 경보 데이터이며, 현재 시연 케이스(기초 근입 0.08 m)와 척도가 다르다.'],
  ], [2600, 7038], { size: 17 }),
);

// 부록 C
add(
  H1('부록 C. 재현 방법'),
  P('아래 경로는 모두 `docs/report/` 기준이다.', { align: AlignmentType.LEFT }),
  BUL('`npx vite --port 5199`로 앱 실행, `tools/make_demo_csv.py <폴더>`로 시연용 CSV 생성'),
  BUL('`tools/capture_screens.mjs <출력> <CSV> 1920 1200` — 화면 10종·CFD 3종 캡처와 영역 좌표(`rects.json`)'),
  BUL('`tools/annotate_screens.py <캡처 폴더> screens` — 번호 마커 합성'),
  BUL('`tools/build_screens.js screens <출력.docx>` — Word 문서 생성'),
);

const doc = new Document({
  creator: 'AIScour', title: '시뮬레이션 대시보드 화면 10종',
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: FONT, color: NAVY }, paragraph: { spacing: { before: 120, after: 120 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, font: FONT, color: '2B3A4A' }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, right: 1134, bottom: 1000, left: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A9B4C0', space: 4 } }, children: [new TextRun({ text: '시뮬레이션 대시보드 화면 10종 — 교량 세굴 3D 시각화', font: FONT, size: 17, color: GRAY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['- ', PageNumber.CURRENT, ' -'], font: FONT, size: 18, color: GRAY })] })] }) },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('written', OUT, buf.length, 'bytes; tables', tableNo, 'figures', figNo);
});
