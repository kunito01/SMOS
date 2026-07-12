<p align="center">
  <img src="./app/icon.svg" width="104" alt="Studio Map OS ロゴ" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>CREATIVE PROJECT OPERATING SYSTEM</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <strong>日本語</strong> · <a href="./README.es.md">Español</a> · <a href="./README.pt-BR.md">Português</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.tr.md">Türkçe</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  <strong>一人スタジオを、完全なチームのように動かす。</strong><br />
  インディペンデントクリエイターと一人会社のための、ローカルファーストなビジュアルプロジェクト運営システム。
</p>

<p align="center">
  <a href="https://kunito01.github.io/SMOS/login/"><img src="./docs/readme/live-demo.svg" alt="ライブデモを開く" /></a>
  <a href="https://github.com/kunito01/SMOS/releases/latest"><img src="./docs/readme/download-pwa.svg" alt="ポータブル PWA をダウンロード" /></a>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="GitHub スター" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="GitHub フォーク" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="GitHub Issue" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="インストール可能な PWA" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="ローカルファーストのデータ" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-03b5aa?style=flat-square" alt="Apache License 2.0" /></a>
</p>

---

## 概要

Studio Map OS は、ブランド、プロジェクトグループ、プロジェクト、人員、ソフトウェア、コスト、タイムライン、リリースチェックポイント、アーカイブを、1 つのビジュアルワークスペースに統合します。クリエイティブなプロセスを汎用的なタスクリストに押し込めることなく、インディペンデントクリエイターが複数のプロジェクトを並行して運営できるよう支援します。

現在のバージョンは、インストール可能なローカルファースト PWA です。業務データはデバイス内に保持され、Web Crypto で暗号化されたうえで IndexedDB に永続化されます。Web App Manifest、Service Worker、オフラインフォールバック、アプリケーションアイコン、スタンドアロンのパッケージングワークフローを統合済みです。アカウント、リカバリーキー、バックアップもブラウザ内で処理されます。リモートの業務バックエンドおよびサーバー認証は、現時点では接続されていません。

## スクリーンショット

![Studio Map OS の画面 01](./docs/screenshots/01.png)

![Studio Map OS の画面 02](./docs/screenshots/02.png)

![Studio Map OS の画面 03](./docs/screenshots/03.png)

## 主な機能領域

| プロジェクト運営 | ローカルデータ管理 |
| --- | --- |
| スタジオ全体、ブランド、プロジェクトグループ単位のダッシュボード | ローカルアカウントとワークスペースのリカバリーキー |
| プロジェクトの状態、ステージ、タスク、タイムライン、リリース | 暗号化された IndexedDB ワークスペースレコード |
| フェーズ別予算、売掛金、多通貨合計 | 暗号化されたデバイス、ワークスペース、プロジェクトのバックアップ |
| 人員、ソフトウェアサブスクリプション、コストテンプレートのライブラリ | 旧ブラウザデータの移行とトランザクション単位の復旧 |
| プロジェクトのアーカイブ、復元、完全削除 | フィールド単位で制御できる読み取り専用共有スナップショット |
| デスクトップ、タブレット、狭幅モバイル対応レイアウト | インストール可能な PWA、オフラインフォールバック、11 のインターフェース言語 |

## 主要機能

- **ブランドとプロジェクトグループ** — ブランドを明確に分け、再利用可能なプロジェクトグループ種別で業務を整理します。
- **プロジェクトワークスペース** — 状態、ステージ、目標、タスク、人員、ツール、素材、バージョン、アクティビティ記録を追跡します。
- **ビジュアルタイムライン** — 各プロジェクトのフェーズ日程、タスク、担当者、ツール、メモ、カスタム行を設定します。
- **構造化予算** — 税金と予備費を含め、人件費、交通費、日次経費、外注費、追加コスト、ソフトウェア費をフェーズごとに計画します。
- **コストと売掛金** — 予算、実績コスト、ソフトウェアサブスクリプション、プロジェクトの支払予定を集約します。
- **再利用可能なライブラリ** — 人員、ソフトウェアツール、サブスクリプション、コストテンプレートを管理します。
- **アーカイブと可搬性** — プロジェクトのアーカイブ、個別プロジェクトの書き出し、ブラウザ内にある Studio Map OS 全データのバックアップに対応します。
- **読み取り専用共有** — プロジェクトのスナップショットに、タイムライン、成果物、人員、ツール、素材、バージョン、コストプレビューのどれを含めるか選択できます。
- **多言語インターフェース** — 英語、簡体字中国語、日本語、スペイン語、ポルトガル語、ドイツ語、フランス語、ロシア語、トルコ語、韓国語、タイ語を利用できます。

## 技術構成

- App Router を使用した Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB と Local Storage

## PWA 対応

Studio Map OS には、完全な PWA 統合構成が含まれています。

- 表示モードを `standalone`、開始 URL を `/login` に設定した Web App Manifest。
- 192×192、512×512、マスカブル、Apple Touch の各アイコン。
- Serwist による Service Worker の自動登録とランタイムキャッシュ。
- ルート、ログイン、登録、オフラインページ、Manifest、ブランドアセット、PWA アイコンの事前キャッシュ。
- `/offline` によるドキュメントナビゲーションのフォールバック。
- iOS ホーム画面用メタデータ、テーマカラー、`viewport-fit=cover`。
- スタンドアロン Next.js サーバー、静的アセット、起動スクリプトを収録した可搬型 PWA バンドル。

> [!NOTE]
> 開発モードでは、古いキャッシュが開発に干渉しないよう Service Worker を無効にします。インストール、キャッシュ、オフライン動作は、`localhost` または HTTPS 上の本番ビルドで確認してください。

## はじめに

### 必要環境

- Node.js 20 LTS 推奨
- npm
- Web Crypto と IndexedDB に対応するモダンブラウザ

### インストールと起動

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

[http://localhost:3000/register](http://localhost:3000/register) を開き、最初のローカルアカウントを作成します。

初回利用時：

1. 名前、メールアドレス、8 文字以上のパスワードを入力します。
2. 新しいワークスペースを作成します。
3. 生成された 16 桁のワークスペースリカバリーキーを、すぐにコピーまたはダウンロードします。
4. ワークスペースに入る前に、リカバリーキーが安全に保管されていることを確認します。

> [!IMPORTANT]
> リカバリーキーは、アカウントと一緒に平文では保存されません。パスワードとリカバリーキーの両方を紛失し、利用可能なバックアップも残っていない場合、ワークスペースデータを復元できない可能性があります。

既存のローカルアカウントは [http://localhost:3000/login](http://localhost:3000/login) からサインインできます。任意のパスワードを受け付ける設定済みアカウントはありません。

### 本番モードと PWA の確認

```bash
npm run build
npm run start
```

PWA 対応ブラウザで [http://localhost:3000/login](http://localhost:3000/login) を開き、Manifest、Service Worker、インストールの入口を確認します。ブラウザは `localhost` をセキュアコンテキストとして扱います。本番環境へのデプロイでは HTTPS を使用してください。

### 可搬型 PWA バンドルの作成

```bash
npm run package:pwa
```

バンドルは `output/pwa/studio-map-os-pwa/` に出力されます。スタンドアロンサーバー、PWA アセットに加え、Windows（`START_STUDIO_MAP_OS.bat`）、macOS（`START_STUDIO_MAP_OS.command`）、Linux/macOS のターミナル（`START_STUDIO_MAP_OS.sh`）用の起動スクリプトが含まれます。すべてのランチャーは既定で `127.0.0.1:3002` を使用します。

## 主なルート

| ルート | 用途 |
| --- | --- |
| `/register` | ローカルアカウントとワークスペースを作成するか、暗号化バックアップを使って既存のワークスペースに参加 |
| `/login` | ローカルアカウントのロック解除、またはデバイス全体のバックアップを復元 |
| `/offline` | Service Worker のナビゲーションに失敗した場合のドキュメントフォールバック |
| `/dashboard` | スタジオ概要、スコープ、指標、プロジェクトマップ |
| `/companies` | ブランドとプロジェクトグループの管理 |
| `/company/?companyId=...` | ブランド詳細と関連プロジェクトの概要 |
| `/projects` | 進行中の全プロジェクト |
| `/project/?projectId=...` | プロジェクトの状態、タイムライン、リリース、売掛金、設定 |
| `/project-costs/?projectId=...` | プロジェクトの予算とコスト詳細 |
| `/project-share/?projectId=...` | 読み取り専用共有フィールドの設定 |
| `/costs` | スタジオ全体のコスト合計と表示通貨の設定 |
| `/libraries` | 人員、ソフトウェアサブスクリプション、コストテンプレートのライブラリ |
| `/archive` | アーカイブ済みプロジェクト、およびデバイスとワークスペースのバックアップ復旧 |
| `/share/?token=...` | ローカルの読み取り専用プロジェクトスナップショット |

## データとセキュリティのモデル

```text
React ページ
    ↓
lib/api のローカルアダプター
    ↓
メモリ内の業務データベース
    ↓
Web Crypto による暗号化
    ↓
IndexedDB への永続化
```

- 業務データはワークスペースごとに分離され、暗号化された IndexedDB レコードとして保存されます。
- パスワードは保護されたワークスペースのマスターキーを解除します。マスターキーはサインイン後、メモリ内でのみ使用されます。
- 16 桁のリカバリーキーを使ってワークスペースのマスターキーを復旧し、暗号化バックアップファイルを解除できます。
- ワークスペースレコードとバックアップのエンベロープには、PBKDF2、HKDF、AES-GCM などのブラウザ暗号技術を使用します。
- デバイス全体のバックアップには、ローカルアカウント、ワークスペース、設定、暗号化されたデータベーススナップショットが含まれます。ワークスペースとプロジェクトの書き出しも暗号化されます。
- ブラウザが永続ストレージの要求を拒否する場合があるため、暗号化バックアップは引き続きデータ保護の重要な要素です。

> [!WARNING]
> これらの仕組みは独立したセキュリティ監査を受けていません。専門的な鍵管理、サーバーバックアップ、企業向け ID システムの代替にはなりません。

## 多通貨コスト

現在、計算と表示に対応している通貨は次のとおりです。

- CNY — 中国人民元
- USD — 米ドル
- JPY — 日本円
- EUR — ユーロ

ブラウザは Frankfurter の ECB 対応サービスから参照為替レートを直接取得し、取得に失敗した場合はブラウザキャッシュまたは同梱レートを使用します。為替レートはスタジオ内部の見積もりを目的としており、決済や財務上の助言には使用できません。

## バックアップファイル

| 種別 | 内容 | 一般的なファイル名 |
| --- | --- | --- |
| デバイス全体のバックアップ | すべてのローカルアカウント、ワークスペース、設定、暗号化データ | `studio-map-os-*.smos-backup.json` |
| ワークスペースのバックアップ | 現在のワークスペースの業務データと設定 | `studio-map-os-workspace-*.smos-backup.json` |
| プロジェクトファイル | 1 件のプロジェクトスナップショット | `studio-map-os-project-*.smos-project.json` |

復元する前に、バックアップの種別とリカバリーキーを確認してください。デバイス全体の復元では、現在のブラウザ内にある Studio Map OS の既存データが置き換えられる場合があります。

## 現在の公開共有の範囲

読み取り専用の共有レコードは現在、それを生成したブラウザと Web サイトオリジン内に保持されます。共有 URL はローカルで開けますが、データが自動的にリモートサーバーへ公開されることはありません。そのため、次の制約があります。

- 別のブラウザで開いた場合、サイトデータを消去した場合、または別のデバイスを使用した場合、リンクが機能しなくなることがあります。
- この機能は、インターネット上にホストされる公開ページと同等ではありません。
- デバイスをまたぐ共有には、リモートストレージ、アクセス制御、アクセス取消のための基盤が必要です。

## 国際化

インターフェースは 11 言語に対応しています。専用の翻訳キーがない場合、ロケールファイルは英語へフォールバックします。現在、ロシア語とトルコ語の辞書はすべての翻訳キーを網羅しています。Issue や Pull Request を通じた、翻訳範囲および表現の改善を歓迎します。

## プロジェクト構成

```text
app/                  Next.js のルート、Manifest、Service Worker、静的 PWA エントリーポイント
components/           ページ、プロダクトモジュール、レイアウト、共通 UI
lib/api/              ローカル業務 API アダプター
lib/i18n/             インターフェース辞書とドメインラベル
lib/mock/             デモ用シードデータと集計ロジック
lib/security/         ワークスペースと公開共有の暗号化
lib/storage/          IndexedDB と永続ストレージ対応
lib/types/            ドメインモデル
lib/utils/            予算、通貨、フェーズ、リリースのユーティリティ
public/               ブランドアセット、PWA アイコン、生成済み Worker バンドル
scripts/              可搬型 PWA のビルドおよびパッケージングスクリプト
```

## 品質チェック

```bash
npm run lint
npx tsc --noEmit --incremental false
```

このリポジトリには、まだ自動化されたユニットテストやエンドツーエンドテストがありません。暗号化、移行、復旧、予算計算に関する変更は、マージ前に追加の検証を行ってください。

## 現在の制限事項

- 業務 API は引き続きブラウザローカルのアダプターであり、本番用サーバーバックエンドには接続されていません。
- 新規プロジェクトは完全な空白テンプレートから始まるのではなく、デモプロジェクト構成の一部を引き継ぎます。
- 実績コスト、素材、アクティビティ記録の編集フローは、まだ完全には公開されていません。
- プロジェクトグループの詳細、共有の取消、リンク有効期限の管理は、まだ接続作業が必要です。
- ページを完全に再読み込みすると、ワークスペースを解除するためにパスワードの再入力が必要です。
- PWA 対応は統合済みですが、Lighthouse、インストールフロー、オフラインのエンドツーエンドテストはまだ自動化されていません。
- キャッシュされていない動的ページやリアルタイムのネットワークエンドポイントは、オフライン時に利用できない場合があります。オフラインフォールバックとローカルデータは、リモート API の代替にはなりません。

## コントリビューション

Issue と Pull Request を歓迎します。変更を提出する前に、次の点を確認してください。

1. 影響を受けるページ、データモデル、または移行範囲を説明する。
2. デスクトップと狭幅画面の両方のレイアウトを確認する。
3. ESLint と TypeScript のチェックを実行する。
4. データ形式を変更する場合は、後方互換性とバックアップ復旧について文書化する。

## ライセンス

本プロジェクトは Apache License 2.0 の下で提供されています。詳しくは [LICENSE](./LICENSE) をご覧ください。ライセンスの条件に従い、本プロジェクトを使用、複製、変更、配布できます。

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. All rights reserved.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
