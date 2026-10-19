import { watchAccount } from '../net/cloud';
import { bindBattle } from './battle';
import { bindCatacombs } from './catacomb';
import { bindEditor } from './editor';
import { gateAccount, gateAccountUnavailable, startGate } from './gate';
import { bindHome, openHome } from './home';
import { setAccount } from './state';
import { bindVersus } from './versus';

export function initApp(): void {
  bindHome();
  bindEditor();
  bindVersus();
  bindBattle();
  bindCatacombs();
  openHome();
  startGate();
  watchAccount((a) => {
    gateAccount(a);
    void setAccount(a);
  }).catch(() => {
    // オフラインなどでログイン機能が読めなくても、パスワードを入れれば端末内だけで遊べる
    gateAccountUnavailable();
  });
}
