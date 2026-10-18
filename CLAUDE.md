# cinder_duel

1対1のダイス×カード決闘ゲーム。TypeScript + Vite、テストは Vitest。

- ルールの仕様は docs/RULES.md。ルールを変えたらここも更新する
- `src/engine/` と `src/character/` は DOM に触れない純粋な処理。`src/game/battle.ts` は画面と `BattleIO` 経由でだけやり取りする
- 数値は `src/data/` に置き、コードに直書きしない
- 画面の文言は日本語
- 変更後は `npm run typecheck && npm test` を通す
- ルールブック（ダークソウルTRPG）の本文・画像はリポジトリに入れない
- 保存データの形式を変えたら `SAVE_VERSION` を上げて `migrate` に変換を足す（古いセーブを壊さない）
