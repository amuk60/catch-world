import { ASSET_MANIFEST } from '../config.js';
import { makeTextures } from '../textures.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    Object.entries(ASSET_MANIFEST).forEach(([key, path]) => this.load.image(key, path));
  }

  create() {
    makeTextures(this);
    this.scene.start('World');
  }
}
