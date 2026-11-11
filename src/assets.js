// 브라우저 전용: glTF 모델 로딩과 캐시.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelUrl } from './logic/modelUrl.js';

const loader = new GLTFLoader();
const cache = new Map(); // url -> Promise<Group|null>

export function loadModel(pack, name) {
  const url = modelUrl(pack, name);
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((gltf) => gltf.scene).catch((err) => {
      console.warn(`모델 로딩 실패: ${url}`, err);
      return null;
    }));
  }
  return cache.get(url);
}

// items 에 쓰인 고유한 (pack,name) 모델을 병렬로 불러와 `${pack}/${name}` -> Group 맵으로 돌려준다.
export async function loadModels(items) {
  const keys = new Map();
  for (const it of items) keys.set(`${it.pack}/${it.name}`, it);
  const entries = await Promise.all([...keys].map(async ([key, it]) => [key, await loadModel(it.pack, it.name)]));
  return new Map(entries);
}
