// 코어 매니저는 모두 dispose()를 호출하여 GPU 리소스 및 이벤트 리스너를 명시적으로 해제한다.
// Three.js는 GC가 텍스처/지오메트리를 자동 해제하지 않으므로 명시적 정리가 필수이다.
export interface Disposable {
  dispose(): void;
}
