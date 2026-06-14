# AXIOM

個人用システムモニタ — 5つの生体指標を記録し、**SYSTEM INTEGRITY** を算出。ログをローカルに永続化し、任意で LLM による構造化も行います。

![メインパネル](docs/screenshots/panel.png)

## 概要

AXIOM は CLI 美学の計器板 UI による日次自己状態トラッカーです。

- **5指標**（0–100）: Cognitive Load（認知負荷）、Physical Energy（物理的体力）、Mental Energy（精神的体力）、Autonomy（自律統制率）、Entropy（エントロピー）
- **SYSTEM INTEGRITY** — Safe Mode（Graceful Degradation）と Not-To-Do パージボーナスを含む非線形スコアリング
- **FastAPI + SQLite** バックエンド — ログ・イベントの永続化
- **履歴分析** — 時系列グラフ、相関散布図、CSV エクスポート
- **ローカル LLM（Mimi / Nana）** — LM Studio 経由のノート構造化と Safe Mode 正当化テキスト生成（任意）

| スクリーンショット | 説明 |
|---|---|
| [Panel](docs/screenshots/panel.png) | メイン計器板 |
| [History](docs/screenshots/history.png) | ログタイムラインとグラフ |
| [Safe Mode](docs/screenshots/safe-mode.png) | Graceful Degradation トグル |

## 技術スタック

| レイヤ | 構成 |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Desktop | Tauri 2（Rust）、フレームレス透過ウィンドウ |
| Mobile | Capacitor 8（Android） |
| Backend | FastAPI, SQLAlchemy, SQLite |
| LLM | LM Studio（OpenAI 互換 API）、httpx 非同期クライアント |

## クイックスタート

### Web（開発）

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn main:app --reload --port 8000

# 別ターミナル
npm install
npm run dev
```

http://localhost:5173 を開く

### デスクトップ（Tauri）

```powershell
npm run tauri dev
```

### 本番ビルド

```powershell
npm run tauri build
```

インストーラ出力: `src-tauri/target/release/bundle/`

## アーキテクチャ

```
React UI (Vite)
    │  REST /api/logs, /api/events, /api/health, /api/llm/*
    ▼
FastAPI + SQLite (axiom.db)
    │  BackgroundTasks → Mimi enrichment（任意）
    ▼
LM Studio :1234（ローカル、任意）
```

Tauri は `scripts/prepare-backend-bundle.ps1` により Python バックエンドを `src-tauri/resources/backend/` に同梱します。

## 主な機能

- **Safe Mode** — リソース枯渇時に非線形ペナルティを無効化
- **COMMIT** — 現在の指標とノートを SQLite にスナップショット保存
- **PURGE（Not-To-Do）** — 破棄した禁止行動を記録し、スコアボーナスに反映
- **Mimi** — 自由記述ノートを `{ trigger, category, impact[] }` に構造化
- **Nana** — 現在の指標から Safe Mode 正当化テキストを生成

## リポジトリ

https://github.com/aksunknk/axiom

## ライセンス

個人利用プロジェクト。
