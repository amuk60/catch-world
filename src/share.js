// 브라우저 전용: 결과 이미지(PNG 카드) 만들기·저장, 텍스트 복사.
const W = 1200;
const H = 630;
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

// 3D 화면(rendererCanvas)을 "cover" 로 깔고 어둡게 한 뒤 문구를 올린 1200x630 캔버스를 돌려준다. 그리기에 실패하면 단색 배경.
// lines: { title, delta, detail, tagline, footer, url }
export function renderShareCard(rendererCanvas, lines) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b1d18'; // 어두운 따뜻한 색
  ctx.fillRect(0, 0, W, H);
  try {
    const sw = rendererCanvas.width;
    const sh = rendererCanvas.height;
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(rendererCanvas, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } catch (err) {
    console.warn('3D 화면을 그리지 못해 단색 배경을 씁니다.', err);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(20, 12, 10, 0.55)');
  g.addColorStop(1, 'rgba(20, 12, 10, 0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(lines.title, W / 2, 150);
  ctx.fillStyle = '#ffd28a';
  ctx.font = `700 60px ${FONT}`;
  ctx.fillText(lines.delta, W / 2, 270);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText(lines.detail, W / 2, 360);
  ctx.fillStyle = '#ff9d4d';
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(lines.tagline, W / 2, 450);

  ctx.shadowBlur = 6;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8dcc8';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(lines.footer, 40, H - 62);
  ctx.fillText(lines.url, 40, H - 28);
  return canvas;
}

// PNG 로 내려받는다(앵커 다운로드). 성공하면 true.
export function saveShareCard(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(false); return; }
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      resolve(true);
    }, 'image/png');
  });
}

// 클립보드에 텍스트를 복사한다. 실패하면 숨은 textarea 로 다시 시도. 복사됐으면 true.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}
