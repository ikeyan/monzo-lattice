# Monzo Lattice

格子 (lattice) 上で純正律のピッチを指定し、マルチタッチで和音を演奏する Web アプリ。

- 仕様: [docs/spec.md](docs/spec.md)
- デプロイ先: GitHub Pages

## 技術スタック

| 項目 | 採用 |
| --- | --- |
| 言語 | TypeScript (型チェックは [typescript-go](https://github.com/microsoft/typescript-go) = `tsgo`) |
| スタイル | 関数型プログラミング |
| ビュー | React |
| 状態管理 | jotai |
| イベント処理 | RxJS (`atomWithObservable` で jotai に接続) |
| フォーマッタ / リンタ | oxfmt / oxlint |
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

### 型チェックの構成

tsgo は Deno のグローバルや import map を直接は知らないため、2 つの
tsconfig プロジェクトに分けて両方をチェックする:

- `tsconfig.json` — ブラウザで動くコード (`src/`、`*_test.ts` を除く)。lib に DOM を含む。
- `tsconfig.test.json` — Deno コンテキストのコード (テストと `scripts/`)。DOM の代わりに
  `deno types` で生成した `deno.d.ts` (gitignore 済み、`deno task check:types` が再生成)
  を含む。

依存は `deno.json` の import map で bare specifier → `npm:` に解決し、
`nodeModulesDir: "auto"` で `node_modules` を実体化して tsgo からも解決できるようにしている。

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
