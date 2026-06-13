import './styles/main.css';
import './styles/board.css';
import './styles/panels.css';
import './styles/dialogs.css';

import { GameController } from './game/GameController.js';
import { installAppHeight } from './ui/appHeight.js';

// Track the real viewport height (fixes iOS not recomputing dvh on rotation).
installAppHeight();

const controller = new GameController();
controller.init().catch((err) => {
  console.error('Failed to initialize game:', err);
});
