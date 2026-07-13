/** 긴 동기 작업 사이에 메인 스레드를 양보해 클릭·렌더링이 가능하게 한다. */
export function yieldToMain(): Promise<void> {
  const scheduler = globalThis.scheduler;
  if (scheduler && typeof scheduler.yield === 'function') {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
