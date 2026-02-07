import './styles/main.css';
import './styles/board.css';
import './styles/panels.css';
import './styles/dialogs.css';
import './styles/setup.css';

import { GameController } from './game/GameController.js';

const controller = new GameController();
controller.init().catch(err => {
  console.error('Failed to initialize game:', err);
});
