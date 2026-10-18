import { bindBattle } from './battle';
import { bindEditor } from './editor';
import { bindHome, openHome } from './home';
import { watchAccount } from '../net/cloud';
import { setAccount } from './state';
import { bindVersus } from './versus';

export function initApp(): void {
  bindHome();
  bindEditor();
  bindVersus();
  bindBattle();
  openHome();
  void watchAccount((a) => void setAccount(a)).catch(() => {
    /* オフラインなどでログイン機能が読めなくても、端末内だけで遊べる */
  });
}
