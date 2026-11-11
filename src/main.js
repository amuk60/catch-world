import { isMobileUA } from './env.js';
import { createStage } from './stage.js';
import { buildFloor, buildPlayer } from './world.js';

if (isMobileUA(navigator.userAgent)) {
  document.getElementById('mobile-notice').style.display = 'flex';
} else {
  const { scene } = createStage(document.getElementById('game'));
  buildFloor(scene);
  buildPlayer(scene);
}
