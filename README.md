# Monzo Lattice

格子 (lattice) 上で純正律のピッチを指定し、マルチタッチで和音を演奏する Web アプリ。

- 仕様: [docs/spec.md](docs/spec.md)
- デプロイ先: GitHub Pages

## 技術スタック

| 項目 | 採用 |
| --- | --- |
| 言語 | TypeScript (型チェックは `deno check`) |
| スタイル | 関数型プログラミング |
| ビュー | React |
| 状態管理 | jotai |
| イベント処理 | RxJS (`atomWithObservable` で jotai に接続) |
| フォーマッタ / リンタ | `deno fmt` / `deno lint` |
| バンドル | `deno bundle` (HTML エントリポイントから) |
| テスト | `Deno.test` + fast-check (プロパティテスト) |
| CI / デプロイ | GitHub Actions / GitHub Pages |

## 開発

Deno 2.8+ が必要 (ランタイム・タスクランナー・テストランナーとして使用)。

```sh
deno install        # 依存のインストール (node_modules を生成)
deno task check     # フォーマット・リント・型・テストの一括チェック
deno task fix       # autofix (oxfmt + oxlint --fix) の一括実行
deno task test      # テストのみ
deno task build     # dist/ にバンドル
deno task serve     # ビルドして http://localhost:8000 で配信
```

### 見た目の確認 (スクリーンショット)

Playwright の Chromium でレンダリング結果を画像にできる
(開発サンドボックスにはブラウザがプリインストール済み):

```sh
deno task serve &
npx -y playwright screenshot --viewport-size=1280,800 \
  --wait-for-timeout=2500 http://localhost:8000/ screenshot.png
```

### 型チェックの構成

型チェック・フォーマット・リントはすべて Deno 組み込み (`deno check` / `deno fmt` /
`deno lint`) を使う。`deno check` は import map・`npm:`・`jsr:` をネイティブに解決し、
React の型も import map の `@types/react` / `@types/react-dom` から自動で解決される。

Deno 2.5+ は `tsconfig.json` を自動検出して型チェックに使う
(`include` / `exclude` によるスコープも有効)。これを利用してブラウザコードと
Deno コンテキストを分けている:

- `tsconfig.json` の `include: src` (テスト除外) — lib は DOM のみで
  `Deno` グローバルなし。ブラウザコードが誤って Deno API に依存すると型エラーになる。
- 除外されたテスト (`*_test.ts`) — Deno 既定の設定でチェックされ、
  `Deno.test` がそのまま書ける。

注意: `deno.json` に `compilerOptions` を書くと `tsconfig.json` より優先されて
このスコープ分けが壊れるため、コンパイラ設定は `tsconfig.json` 側に置くこと。

### テスト方針

`Deno.test` + [fast-check](https://fast-check.dev/) によるプロパティテストを主体とし、
代数的性質 (例: monzo の積が比の乗算に対応する、可換群を成す) を検証する。
簡潔なわりにバグ発見確率の高いテストを目指す。

## CI / デプロイ

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — PR と main への push で
  `deno task check` とビルドを実行。
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — main への push で
  GitHub Pages にデプロイ。
- 初回のみ、リポジトリの Settings → Pages → Source を **GitHub Actions** に設定すること。
