# cinder_duel

1対1のダイス×カード決闘ゲーム。TypeScript + Vite、テストは Vitest。

- ルールの仕様は docs/RULES.md。ルールを変えたらここも更新する
- `src/engine/` と `src/character/` は DOM に触れない純粋な処理。`src/game/battle.ts` は画面と `BattleIO` 経由でだけやり取りする
- 数値は `src/data/` に置き、コードに直書きしない
- 画面の文言は日本語
- 変更後は `npm run typecheck && npm test` を通す
- ルールブック（ダークソウルTRPG）の本文・画像はリポジトリに入れない
- 保存データの形式を変えたら `SAVE_VERSION` を上げて `migrate` に変換を足す（古いセーブを壊さない）
- Supabase の secret key などの秘密の値はリポジトリに入れない（公開リポジトリ）。publishable key のみ `src/net/config.ts` に置く
- **シードを守る**: 第1版・第2版の地下墓の生成（`buildCatacomb`、`CATACOMB_ORDER`、`CATACOMBS` の敵と宝の表、`DUNGEON` の間取りに関わる値）を変えると `tests/seeds.test.ts` が落ちる。変えたいときは今までの版を残し、`GENERATORS` に次の版を足して `CURRENT_SEED_VERSION` を上げる。敵のレベル・HP・ソウルなどの数値調整はしてよい
- 装備・カードのIDは改名・削除しない（古いセーブとシードが壊れる）。困難な地下墓（`src/data/fixed.ts`）は公開後に中身を変えず、直すなら新しく足す
