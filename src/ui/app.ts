import { bindBattle } from './battle';
import { bindEditor } from './editor';
import { bindHome, openHome } from './home';
import { bindVersus } from './versus';

export function initApp(): void {
  bindHome();
  bindEditor();
  bindVersus();
  bindBattle();
  openHome();
}
