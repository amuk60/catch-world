export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    this.add.text(20, 20, '월드 준비 중', { fontSize: '24px', color: '#ffffff' });
    this.add.image(480, 320, 'player');
  }
}
