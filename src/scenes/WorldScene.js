import {
  GAME_WIDTH as W,
  GAME_HEIGHT as H,
  PLAYER_SPEED,
  INTERACT_RADIUS,
  COMFORT_MESSAGES,
} from '../config.js';
import { findInteractable } from '../logic/interact.js';

const FONT = 'Malgun Gothic, Apple SD Gothic Neo, sans-serif';
const COMFORT_SPOTS = [
  { x: 140, y: 230 },
  { x: 820, y: 300 },
  { x: 200, y: 520 },
];

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    this.add.tileSprite(0, 0, W, H, 'floor').setOrigin(0);
    this.add.rectangle(W / 2, 40, W, 80, 0x3a3a5c);
    this.add.text(W / 2, 40, 'CATCH · 번아웃 소각장', {
      fontFamily: FONT, fontSize: '28px', color: '#ffd166',
    }).setOrigin(0.5);
    this.add.text(W / 2, 104, '방향키/WASD 이동 · E 또는 스페이스: 상호작용', {
      fontFamily: FONT, fontSize: '14px', color: '#cfcfe6',
    }).setOrigin(0.5);

    this.physics.world.setBounds(0, 80, W, H - 80);
    this.furnace = this.physics.add.staticImage(W / 2, 220, 'furnace');
    this.player = this.physics.add.sprite(W / 2, H - 120, 'player').setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.furnace);

    this.interactables = [{ id: 'furnace', x: W / 2, y: 220 }];
    COMFORT_SPOTS.forEach((p, i) => {
      this.add.image(p.x, p.y, 'comfort');
      this.interactables.push({ id: `comfort-${i}`, x: p.x, y: p.y, message: COMFORT_MESSAGES[i] });
    });

    this.prompt = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '14px', color: '#ffffff',
      backgroundColor: '#000000aa', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(10).setVisible(false);

    this.dialog = this.add.text(W / 2, H - 50, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffffff', align: 'center',
      backgroundColor: '#000000cc', padding: { x: 14, y: 10 }, wordWrap: { width: W - 120 },
    }).setOrigin(0.5).setDepth(10).setVisible(false);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.keyE = this.input.keyboard.addKey('E');
    this.keySpace = this.input.keyboard.addKey('SPACE');
  }

  update() {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);
    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
    if (vx && vy) this.player.body.velocity.normalize().scale(PLAYER_SPEED);

    const near = findInteractable({ x: this.player.x, y: this.player.y }, this.interactables, INTERACT_RADIUS);
    if (near) {
      this.prompt
        .setText(near.id === 'furnace' ? 'E: 소각 시작' : 'E: 살펴보기')
        .setPosition(near.x, near.y - 50)
        .setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }

    const pressed = Phaser.Input.Keyboard.JustDown(this.keyE) || Phaser.Input.Keyboard.JustDown(this.keySpace);
    if (near && pressed) this.interact(near);
  }

  interact(obj) {
    if (obj.id === 'furnace') {
      // 단계 4에서 BurnGame 씬 전환 연결
      return;
    }
    this.dialog.setText(obj.message).setVisible(true);
    if (this.dialogTimer) this.dialogTimer.remove();
    this.dialogTimer = this.time.delayedCall(3000, () => this.dialog.setVisible(false));
  }
}
