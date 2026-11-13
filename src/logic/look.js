// 공간 모양(look) 도우미 (순수). look 은 config 의 INTERIOR_LOOK / INTERVIEW_LOOK 같은 객체이고, 그리는 쪽(interiorKit.js)이 모델 재질을 덮어쓸 때 쓴다.

// 모델 하나의 재질 덮어쓰기: look.materials 의 '*'(모든 모델) 위에 모델 이름별 설정을 얹는다. 재질 이름 -> 색(0xRRGGBB) 또는 { color, roughness, opacity }.
export function materialOverrides(look, name) {
  return { ...look.materials?.['*'], ...look.materials?.[name] };
}

// 0xRRGGBB 색의 [r, g, b] (0~255).
export function rgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// '#rrggbb' 문자열 색의 [r, g, b] (0~255). 형식이 다르면 null.
export function cssRgb(text) {
  const m = /^#([0-9a-f]{6})$/i.exec(text);
  return m ? rgb(parseInt(m[1], 16)) : null;
}
