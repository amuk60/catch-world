export function isMobileUA(ua) {
  return /Android|iPhone|iPad|iPod|Mobi/i.test(ua || '');
}
