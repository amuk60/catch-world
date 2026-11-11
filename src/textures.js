// 에셋이 없어도 게임이 돌아가도록 도형으로 임시 텍스처를 만든다.
// 이미 로드된 키(실제 이미지)는 건드리지 않는다.
export function makeTextures(scene) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const make = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw(g);
    g.generateTexture(key, w, h);
  };

  make('floor', 32, 32, (c) => {
    c.fillStyle(0x4a4a6a).fillRect(0, 0, 32, 32);
    c.fillStyle(0x424262).fillRect(0, 0, 16, 16).fillRect(16, 16, 16, 16);
  });
  make('player', 28, 28, (c) => {
    c.fillStyle(0x6ec6ff).fillRect(0, 0, 28, 28);
    c.fillStyle(0x1b1b2f).fillRect(7, 9, 4, 4).fillRect(17, 9, 4, 4);
  });
  make('furnace', 64, 64, (c) => {
    c.fillStyle(0x555566).fillRect(0, 0, 64, 64);
    c.fillStyle(0xff7b3a).fillRect(12, 20, 40, 34);
    c.fillStyle(0xffd166).fillRect(22, 30, 20, 24);
  });
  make('comfort', 24, 24, (c) => {
    c.fillStyle(0xffd166).fillCircle(12, 12, 11);
    c.fillStyle(0x1b1b2f).fillRect(10, 6, 4, 8).fillRect(10, 16, 4, 4);
  });
  make('resume', 80, 100, (c) => {
    c.fillStyle(0xffffff).fillRect(0, 0, 80, 100);
    c.fillStyle(0xcccccc).fillRect(8, 60, 64, 4).fillRect(8, 72, 64, 4).fillRect(8, 84, 40, 4);
  });
  make('notice', 80, 100, (c) => {
    c.fillStyle(0xffd9d9).fillRect(0, 0, 80, 100);
    c.fillStyle(0xe05555).fillRect(0, 0, 80, 10);
  });
  make('coverLetter', 80, 100, (c) => {
    c.fillStyle(0xdbe9ff).fillRect(0, 0, 80, 100);
    c.fillStyle(0x8fb4ee).fillRect(8, 60, 64, 4).fillRect(8, 72, 64, 4).fillRect(8, 84, 40, 4);
  });
  make('fire', 160, 120, (c) => {
    c.fillStyle(0x3a2a2a).fillRect(0, 40, 160, 80);
    c.fillStyle(0xff7b3a).fillTriangle(20, 80, 80, 0, 140, 80);
    c.fillStyle(0xffd166).fillTriangle(50, 80, 80, 30, 110, 80);
  });
  make('shredder', 140, 100, (c) => {
    c.fillStyle(0x777788).fillRect(0, 20, 140, 80);
    c.fillStyle(0x222233).fillRect(20, 30, 100, 10);
    c.fillStyle(0xaaaabb).fillRect(0, 0, 140, 20);
  });
  g.destroy();
}
