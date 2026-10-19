import type { GradeKey } from '@/constants/grade';
import { inferHistoryKind } from '@/viz/eventTimelineHelpers';

/** 목업 — 10번 경보·SOP 초기 데이터 (SCDT_파일럿DT_화면10종_v2.html ST) */
export interface SopChecklistItem {
  gradeKey: GradeKey;
  title: string;
  done: boolean;
  /** 심각 단계 미도달 시 비활성 */
  na?: boolean;
  when?: string;
  who?: string;
}

/** 목업 — 이력 타임라인 시각화용 */
export type SopHistoryKind = 'issue' | 'complete' | 'cancel' | 'attach' | 'system' | 'other';

export interface SopHistoryEntry {
  at: string;
  who: string;
  text: string;
  kind?: SopHistoryKind;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class MockAlertSopStore {
  public alertClosed = false;
  public readonly sop: SopChecklistItem[];
  public readonly history: SopHistoryEntry[];

  public constructor() {
    this.sop = [
      {
        gradeKey: 'a1',
        title: '정상 모니터링 유지',
        done: true,
        when: '10-02 09:22',
        who: '시스템',
      },
      {
        gradeKey: 'a2',
        title: '점검 주기 단축 (주 1회 → 일 1회)',
        done: true,
        when: '10-02 09:40',
        who: '김○○',
      },
      { gradeKey: 'a3', title: '현장 긴급 점검 실시', done: false },
      { gradeKey: 'a3', title: '관리주체 보고', done: false },
      { gradeKey: 'a4', title: '통행 제한 및 긴급 보강 검토', done: false, na: true },
    ];
    this.history = [
      {
        at: '10-02 10:18',
        who: '박○○',
        text: 'A-041 P3 교각 — 현장 사진 3건 첨부 (목업)',
        kind: 'attach',
      },
      { at: '10-02 10:05', who: '이○○', text: 'B-015 QA 오류 연계 — 경보 우선순위 상향' },
      { at: '10-02 09:55', who: '김○○', text: '관리주체 1차 보고서 초안 전송 (목업)' },
      { at: '10-02 09:48', who: '시스템', text: 'P2 교각 잔여 여유율 38 % — 경계 등급 유지 알림' },
      { at: '10-02 09:40', who: '김○○', text: '점검 주기 단축 완료 (주 1회 → 일 1회)' },
      {
        at: '10-02 09:22',
        who: '시스템',
        text: '경보 자동 발령 — P2 교각 주의 → 경계 상승 (잔여 여유율 40 % 미만)',
      },
      { at: '10-02 09:12', who: '최○○', text: 'C-008 대기열 해석 완료 — 모니터링 대상 등록' },
      { at: '10-02 09:05', who: '시스템', text: '케이스 A-032 서비스 반영 — 모니터링 시작' },
      { at: '10-01 21:30', who: '정○○', text: 'D-004 야간 점검 일지 등록 (목업)' },
      { at: '10-01 17:05', who: '시스템', text: 'A-041 최대 세굴심 4.02 m — 주의 등급 발령' },
      { at: '09-30 11:20', who: '김○○', text: 'SOP 완료 — 현장 긴급 점검 실시 (A-030, 목업)' },
      { at: '09-28 16:40', who: '김○○', text: 'SOP 전 항목 완료 — 경보 종료 (A-030 P1)' },
      { at: '09-27 08:15', who: '시스템', text: '가을 홍수기 대비 — 경보 임계치 점검 배치 (목업)' },
      { at: '09-25 11:20', who: '정○○', text: 'C-008 P3 경보 종료 — 잔여 여유율 72 % 회복' },
    ];
  }

  public applicableItems(): SopChecklistItem[] {
    return this.sop.filter((s) => !s.na);
  }

  public allApplicableDone(): boolean {
    return this.applicableItems().every((s) => s.done);
  }

  public toggleSop(index: number, actor = 'admin'): void {
    const item = this.sop[index];
    if (!item || item.na) return;
    item.done = !item.done;
    if (item.done) {
      item.when = nowStamp();
      item.who = actor;
      this.history.unshift({
        at: item.when,
        who: actor,
        text: `SOP 완료 — ${item.title}`,
        kind: 'complete',
      });
    } else {
      delete item.when;
      delete item.who;
      this.history.unshift({
        at: nowStamp(),
        who: actor,
        text: `SOP 완료 취소 — ${item.title}`,
        kind: 'cancel',
      });
    }
  }

  public closeAlert(actor = 'admin'): void {
    if (this.alertClosed || !this.allApplicableDone()) return;
    this.alertClosed = true;
    this.history.unshift({
      at: nowStamp(),
      who: actor,
      text: 'SOP 전 항목 완료 — 경보 종료',
      kind: 'complete',
    });
  }

  /** viz 타임라인용 — kind 보장 */
  public historyForTimeline(): Array<SopHistoryEntry & { kind: SopHistoryKind }> {
    return this.history.map((h) => ({
      ...h,
      kind: h.kind ?? inferHistoryKind(h.text, h.who),
    }));
  }
}
