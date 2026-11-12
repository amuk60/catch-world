// 키마다 처음 한 번만 true 를 돌려주는 표시기 (순수). 한 번만 보내는 분석 이벤트에 쓴다.
export function createOnce() {
  const seen = new Set();
  return (key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
