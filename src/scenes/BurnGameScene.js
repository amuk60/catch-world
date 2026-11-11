import { GAME_WIDTH as W, GAME_HEIGHT as H, STRESS } from '../config.js';
import { StressMeter } from '../logic/stress.js';

const FONT = 'Malgun Gothic, Apple SD Gothic Neo, sans-serif';
const FIRE = { x: 240, y: 470 };
const SHREDDER = { x: 720, y: 470 };
const DROP_RADIUS = 100;
const BAR = { x: 280, y: 30, w: 400, h: 22 };

export default class BurnGameScene extends Phaser.Scene {
  constructor() {
    super('BurnGame');
  }

  create() {
    this.stress = new StressMeter(STRESS);
    this.ended = false;

    this.add.rectangle(W / 2, H / 2, W, H, 0x2a2438);
    this.add.image(FIRE.x, FIRE.y, 'fire');
    this.add.text(FIRE.x, FIRE.y + 80, '소각로', { fontFamily: FONT, fontSize: '18px', color: '#ffd166' }).setOrigin(0.5);
    this.add.image(SHREDDER.x, SHREDDER.y, 'shredder');
    this.add.text(SHREDDER.x, SHREDDER.y + 70, '파쇄기', { fontFamily: FONT, fontSize: '18px', color: '#ffd166' }).setOrigin(0.5);

    this.add.text(W / 2, H - 24, '종이를 끌어다 불에 던지세요', {
      fontFamily: FONT, fontSize: '15px', color: '#cfcfe6',
    }).setOrigin(0.5);

    this.add.rectangle(BAR.x, BAR.y, BAR.w, BAR.h, 0x111111).setOrigin(0, 0.5);
    this.barFill = this.add.rectangle(BAR.x, BAR.y, BAR.w, BAR.h, 0xff6b6b).setOrigin(0, 0.5);
    this.add.rectangle(BAR.x + BAR.w * (STRESS.goal / STRESS.start), BAR.y, 3, BAR.h + 10, 0xffffff);
    this.stressText = this.add.text(W / 2, BAR.y + 26, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
    this.refreshBar();

    this.input.on('dragstart', (_p, obj) => obj.setDepth(5));
    this.input.on('drag', (_p, obj, x, y) => { obj.x = x; obj.y = y; });
    this.input.on('dragend', (_p, obj) => this.dropPaper(obj));

    this.spawnPaper();
  }

  // 단계 5에서 paperQueue 기반 15장 흐름으로 교체
  spawnPaper() {
    const item = { type: 'resume', label: '이력서', action: 'burn', reduce: 5 };
    const x = Phaser.Math.Between(140, W - 140);
    const img = this.add.image(0, 0, item.type);
    const label = this.add.text(0, 0, item.label, {
      fontFamily: FONT, fontSize: '14px', color: '#222222', align: 'center', wordWrap: { width: 70 },
    }).setOrigin(0.5);
    const paper = this.add.container(x, 170, [img, label]);
    paper.setSize(80, 100);
    paper.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-40, -50, 80, 100),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
      draggable: true,
    });
    paper.item = item;
  }

  near(obj, point) {
    return Phaser.Math.Distance.Between(obj.x, obj.y, point.x, point.y) <= DROP_RADIUS;
  }

  dropPaper(paper) {
    const item = paper.item;
    if (!item || this.ended) return;
    if (item.action === 'burn' && this.near(paper, FIRE)) {
      this.tweens.add({
        targets: paper, scale: 0, alpha: 0, duration: 250,
        onComplete: () => paper.destroy(),
      });
      paper.disableInteractive();
      this.cameras.main.shake(80, 0.004);
      this.applyReduce(item.reduce);
    }
  }

  applyReduce(amount) {
    this.stress.reduce(amount);
    this.refreshBar();
  }

  refreshBar() {
    this.barFill.width = BAR.w * (this.stress.value / STRESS.start);
    this.stressText.setText(`스트레스 지수 ${this.stress.value}`);
  }
}
