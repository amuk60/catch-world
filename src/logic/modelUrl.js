// 모델 팩 이름과 파일 이름으로 상대 URL을 만든다 (공백은 %20).
const PACK_DIRS = {
  nature: 'assets/models/kenney_nature-kit/Models/GLTF format',
  fantasy: 'assets/models/kenney_fantasy-town-kit_2.0/Models/GLB format',
};

export function modelUrl(pack, name) {
  const dir = PACK_DIRS[pack];
  if (!dir) throw new Error(`알 수 없는 모델 팩: ${pack}`);
  return encodeURI(`${dir}/${name}.glb`);
}
