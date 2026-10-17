# 灰の決闘（cinder_duel）

スタミナダイスを振り、出目を武器・戦技・カードに振り分けて戦う1対1の決闘ゲーム。
ダークソウルTRPGの戦闘を下敷きにしたオリジナルのゲームで、最終的にはカードゲームにする予定。

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
| `src/data/rules.ts` | 数値調整のつまみ（回復量、ガード消費の式など） |
| `src/data/equipment.ts` | 重量区分・武器・盾 |
| `src/data/fighters.ts` | 素性（プレイヤー）と敵NPC |
| `src/data/cards.ts` | カードと初期デッキ |
| `src/engine/` | 画面に依存しないルール処理（ダイス、コストの支払い、補正、ガード） |
| `src/game/battle.ts` | 戦闘の進行（ラウンド、手番、攻撃とリアクション） |
| `src/game/ai.ts` | NPCの判断 |
| `src/ui/` | 画面 |
| `tests/` | ルール処理のテスト（Vitest） |

武器やカードを足すときは `src/data/` だけを触ればよいようにしてある。

## 公開について

`.github/workflows/deploy.yml` は GitHub Pages に載せるためのもの。手動実行にしてあるので、
Settings → Pages で Source を「GitHub Actions」にしてから Actions タブで実行するまで公開されない。
