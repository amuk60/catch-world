// 브라우저 전용: glTF 모델 로딩과 캐시.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelUrl } from './logic/modelUrl.js';

const loader = new GLTFLoader();
const cache = new Map(); // url -> Promise<gltf|null>

// 전체 glTF 객체({scene, animations})를 불러온다. 실패하면 한 번만 경고하고 null.
export function loadGltf(pack, name) {
  const url = modelUrl(pack, name);
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).catch((err) => {
      console.warn(`모델 로딩 실패: ${url}`, err);
      return null;
    }));
  }
  return cache.get(url);
}

export async function loadModel(pack, name) {
  const gltf = await loadGltf(pack, name);
  return gltf ? gltf.scene : null;
}

// items 에 쓰인 고유한 (pack,name) 모델을 병렬로 불러와 `${pack}/${name}` -> Group 맵으로 돌려준다.
export async function loadModels(items) {
  const keys = new Map();
  for (const it of items) keys.set(`${it.pack}/${it.name}`, it);
  const entries = await Promise.all([...keys].map(async ([key, it]) => [key, await loadModel(it.pack, it.name)]));
  return new Map(entries);
}
