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
| `src/data/accessories.ts` | アクセサリ（指輪・タリスマン）と、地下墓ごとに出るもの |
| `src/data/behaviors.ts` | 強敵・主の動き方（行動パターン・回避とガードの確率） |
| `src/data/crystals.ts` | 淵結晶（種類・値の幅・底ごとの出やすさ・呪われた淵結晶） |
| `src/data/cards.ts` | カード |
| `src/data/presets.ts` | 練習試合の相手（通常・強敵） |
| `src/data/catacombs.ts` | 地下墓（敵・主・手に入るもの）と地下墓の数値 |
| `src/data/fixed.ts` | 困難な地下墓（固定の間取り・特定のシード） |
| `src/data/abyss.ts` | 底（バジリスク・盗掘者狩り・専用の物）、海底（固定の間取り・海底の敵）、深海と底の数値 |
| `src/engine/` | 画面に依存しないルール処理（ダイス、コストの支払い、補正、ガード） |
| `src/character/model.ts` | キャラクターのデータと検査（レベル、装備、デッキ） |
| `src/character/storage.ts` | 保存・書き出し・読み込み（バージョン管理つき） |
| `src/character/sync.ts` | 端末とアカウントのキャラを合わせる処理 |
| `src/net/` | Supabase（ログインとアカウントへの保存） |
| `src/game/battle.ts` | 戦闘の進行（ラウンド、手番、攻撃とリアクション） |
| `src/game/ai.ts` | NPCの判断 |
| `src/game/matchmaking.ts` | 練習試合の相手の選び方 |
| `src/dungeon/` | 地下墓の生成（シードつき乱数）と探索の進み方 |
| `src/ui/` | 画面（一覧・キャラクリ・地下墓・練習試合・戦闘） |
| `tests/` | テスト（Vitest）。`tests/fixtures/seeds-v1.json` は第1版のシードの中身の記録 |

武器・防具・カード・プリセットを足すときは `src/data/` だけを触ればよいようにしてある。
保存データの形式を変えるときは `src/character/storage.ts` の `SAVE_VERSION` を上げ、`migrate` に変換を足す。

## 公開について

main に push すると `.github/workflows/deploy.yml` が GitHub Pages に公開する。

https://workshop7538315-del.github.io/cinder_duel/

初回だけ Settings → Pages で Source を「GitHub Actions」にしておく必要がある。

## ログインとアカウントへの保存（Supabase）

- 接続先と公開用の鍵（publishable key）は `src/net/config.ts`。公開してよい鍵で、データベース側の設定（RLS）で本人のキャラしか読み書きできない
- **secret key・データベースのパスワード・Discord の Client Secret はリポジトリに入れない**
- ログイン後の戻り先として、Supabase の Authentication → URL Configuration に公開URLと `http://localhost:5173/` を登録してある
- テーブル定義は `docs/supabase.sql`

## 入口のパスワード

ログインしていない人は、入るときにパスワードが必要（`src/ui/gate.ts`）。一度入ればそのブラウザでは覚えておく。

- コードにはパスワードそのものではなくハッシュだけを置いている。変えるときは `GATE_HASH` を `sha256('cinder_duel:' + 新しいパスワード)` に差し替える（変えると、覚えていたブラウザでも入り直しになる）
- ブラウザの中だけで確かめる仕組みなので、詳しい人なら回避できる。身内以外を遠ざける程度のもの
- Discordでログインした人はパスワードなしで入れる。誰でもアカウントを作れないようにするには、Supabase で新規登録を止める
