export type Flow3dVariableCategory = 'velocity' | 'scalar' | 'scour';

export interface Flow3dVariableDef {
  id: string;
  label: string;
  defaultUnit: string;
  category: Flow3dVariableCategory;
}

/** FLOW-3D CSV 에서 인식하는 변수 정의 */
export const FLOW3D_VARIABLE_DEFS: Record<string, Flow3dVariableDef> = {
  ux: { id: 'ux', label: 'x방향 유속', defaultUnit: 'm/s', category: 'velocity' },
  vy: { id: 'vy', label: 'y방향 유속', defaultUnit: 'm/s', category: 'velocity' },
  vz: { id: 'vz', label: 'z방향 유속', defaultUnit: 'm/s', category: 'velocity' },
  tke: { id: 'tke', label: '난류 운동 에너지 (TKE)', defaultUnit: 'm²/s²', category: 'scalar' },
  dtke: { id: 'dtke', label: 'TKE 소산율', defaultUnit: 'm²/s³', category: 'scalar' },
  mhyfd: { id: 'mhyfd', label: '수리학적 깊이', defaultUnit: 'm', category: 'scalar' },
  shrvel: { id: 'shrvel', label: '전단 속도', defaultUnit: 'm/s', category: 'scalar' },
  davel: { id: 'davel', label: '깊이 평균 유속', defaultUnit: 'm/s', category: 'scalar' },
  ofvel: { id: 'ofvel', label: '오버플로우/표면 유속', defaultUnit: 'm/s', category: 'scalar' },
  scrp: { id: 'scrp', label: '세굴/침식 스칼라', defaultUnit: '', category: 'scour' },
  scrdif: { id: 'scrdif', label: '초기 지반 대비 세굴/퇴적 변화량', defaultUnit: 'm', category: 'scour' },
};

const KNOWN_IDS = new Set(Object.keys(FLOW3D_VARIABLE_DEFS));

/** 변수명·한글 설명에서 표준 id 를 추출한다. */
export function normalizeFlow3dVariableId(raw: string): string | null {
  const compact = raw.toLowerCase().trim().replace(/\s+/g, '');
  if (KNOWN_IDS.has(compact)) return compact;

  if (compact === 'u') return 'ux';
  if (compact === 'v') return 'vy';
  if (compact === 'w') return 'vz';

  if (compact.includes('ux') || compact.includes('x방향유속')) return 'ux';
  if (compact.includes('vy') || compact.includes('y방향유속')) return 'vy';
  if (compact.includes('vz') || compact.includes('z방향유속')) return 'vz';
  if (compact === 'tke' || compact.includes('난류운동에너지')) return 'tke';
  if (compact.includes('dtke') || compact.includes('tke소산')) return 'dtke';
  if (compact.includes('mhyfd') || compact.includes('수리학적깊이')) return 'mhyfd';
  if (compact.includes('shrvel') || compact.includes('전단속도')) return 'shrvel';
  if (compact.includes('davel') || compact.includes('깊이평균유속')) return 'davel';
  if (compact.includes('ofvel') || compact.includes('오버플로우') || compact.includes('표면유속')) {
    return 'ofvel';
  }
  if (compact.includes('scrp') || compact.includes('세굴') || compact.includes('침식')) return 'scrp';
  if (compact.includes('scrdif') || compact.includes('세굴확산') || compact.includes('확산계수')) {
    return 'scrdif';
  }

  return null;
}

export function isFlow3dMetaLabel(token: string): boolean {
  const t = token.toLowerCase().replace(/\s+/g, '');
  return (
    t.includes('변수명') ||
    t.includes('물리량단위') ||
    t === '단위' ||
    t.includes('물리량')
  );
}
