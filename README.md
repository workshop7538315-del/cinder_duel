# 灰の決闘（cinder_duel）

スタミナダイスを振り、出目を武器・戦技・カードに振り分けて戦う1対1の決闘ゲーム。
ダークソウルTRPGの戦闘を下敷きにしたオリジナルのゲームで、最終的にはカードゲームにする予定。キャラクターを作って保存し、用意された相手や自分のキャラと戦える。

ルールは [docs/RULES.md](docs/RULES.md) にまとめている。

## 遊ぶ・開発する

Node.js 20 以上が必要。

```sh
npm install
npm run dev      # http://localhost:5173 で起動
npm test         # ルール処理のテスト
npm run build    # dist/ に書き出し
```

## 構成

| 場所 | 中身 |
| --- | --- |
| `src/data/rules.ts` | 数値調整のつまみ（派生値の曲線、デッキ枚数、ガード消費の式など） |
| `src/data/classes.ts` | 素性 |
| `src/data/equipment.ts` | 重さの区分・武器・触媒・盾・防具 |
| `src/data/cards.ts` | カード |
| `src/data/presets.ts` | 対戦相手のプリセット（通常・強敵） |
| `src/engine/` | 画面に依存しないルール処理（ダイス、コストの支払い、補正、ガード） |
| `src/character/model.ts` | キャラクターのデータと検査（レベル、装備、デッキ） |
| `src/character/storage.ts` | 保存・書き出し・読み込み（バージョン管理つき） |
| `src/game/battle.ts` | 戦闘の進行（ラウンド、手番、攻撃とリアクション） |
| `src/game/ai.ts` | NPCの判断 |
| `src/game/matchmaking.ts` | 対戦相手の選び方 |
| `src/ui/` | 画面（一覧・キャラクリ・対戦相手・戦闘） |
| `tests/` | テスト（Vitest） |

武器・防具・カード・プリセットを足すときは `src/data/` だけを触ればよいようにしてある。
保存データの形式を変えるときは `src/character/storage.ts` の `SAVE_VERSION` を上げ、`migrate` に変換を足す。

## 公開について

main に push すると `.github/workflows/deploy.yml` が GitHub Pages に公開する。

https://workshop7538315-del.github.io/cinder_duel/

初回だけ Settings → Pages で Source を「GitHub Actions」にしておく必要がある。
