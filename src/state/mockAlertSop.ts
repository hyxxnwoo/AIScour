import type { GradeKey } from '@/constants/grade';

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

export interface SopHistoryEntry {
  at: string;
  who: string;
  text: string;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
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
      { at: '10-02 09:40', who: '김○○', text: '점검 주기 단축 완료 (주 1회 → 일 1회)' },
      {
        at: '10-02 09:22',
        who: '시스템',
        text: '경보 자동 발령 — P2 교각 주의 → 경계 상승 (잔여 여유율 40 % 미만)',
      },
      { at: '10-02 09:05', who: '시스템', text: '케이스 A-032 서비스 반영 — 모니터링 시작' },
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
      });
    } else {
      delete item.when;
      delete item.who;
      this.history.unshift({
        at: nowStamp(),
        who: actor,
        text: `SOP 완료 취소 — ${item.title}`,
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
    });
  }
}
