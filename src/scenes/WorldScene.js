import { GAME_WIDTH as W, GAME_HEIGHT as H, PLAYER_SPEED } from '../config.js';

const FONT = 'Malgun Gothic, Apple SD Gothic Neo, sans-serif';

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
    this.add.text(W / 2, 104, '방향키/WASD 이동', {
      fontFamily: FONT, fontSize: '14px', color: '#cfcfe6',
    }).setOrigin(0.5);

    this.physics.world.setBounds(0, 80, W, H - 80);
    this.furnace = this.physics.add.staticImage(W / 2, 220, 'furnace');
    this.player = this.physics.add.sprite(W / 2, H - 120, 'player').setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.furnace);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
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
  }
}
