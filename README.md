# News LINE - ニュース記事要約LINE送信システム

News LINE は、ウェブ上のニュース記事を自動的に要約し、LINE Messaging API を通じてユーザーに送信する Web アプリケーションです。

## 🎯 Phase 2 実装完了機能

### ✅ 実装済み機能

- **RSS/Atom フィード対応**: 自動的なニュース収集
- **定期配信機能**: スケジュール配信とユーザー個別設定
- **ユーザー管理システム**: LINE Bot によるユーザー登録・設定管理
- **データベース連携**: SQLite による永続化ストレージ
- **包括的管理画面**: タブベース UI による完全管理機能
- **日本語要約**: Gemini 2.5 Flash による高品質日本語要約

### 📋 主要機能

#### 1. **記事処理・要約**
   - URL からの記事内容抽出
   - AI による日本語要約（3レベル：簡潔版、標準版、詳細版）
   - キーワード抽出（日本語対応）
   - フォールバック要約機能
   - RSS/Atom フィード自動解析

#### 2. **LINE Bot 機能**
   - ユーザー自動登録（フォロー時）
   - 即座の記事要約（URL送信）
   - 設定管理コマンド
   - 配信時間・要約レベル変更
   - 購読フィード確認

#### 3. **自動配信システム**
   - RSS フィード定期取得（毎時）
   - ユーザー個別配信時間設定
   - 記事自動要約・配信（30分毎チェック）
   - 重複配信防止

#### 4. **データベース管理**
   - ユーザー情報（LINE ID、設定、配信履歴）
   - RSS フィード管理
   - 記事データ（タイトル、要約、キーワード）
   - 配信履歴追跡
   - 自動クリーンアップ（古いデータ削除）

#### 5. **包括的管理画面**
   - **ダッシュボード**: リアルタイム統計・サービス状況
   - **RSS フィード管理**: 追加・テスト・一覧表示
   - **ユーザー管理**: 登録ユーザー一覧・設定確認
   - **スケジューラー**: 手動実行・状況確認
   - **記事一覧**: 最近の記事・要約確認
   - **ログ管理**: システムログリアルタイム表示

#### 6. **スケジューラー機能**
   - フィード取得: 毎時0分自動実行
   - 記事配信: 30分毎にユーザー配信時間チェック
   - クリーンアップ: 毎日2:00に古いデータ削除

## 🛠️ セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` ファイルを作成し、必要な API キーを設定してください：

```bash
cp .env.example .env
```

### 3. 必要な API キーの取得

#### OpenRouter API (Gemini 2.5 Flash)
1. [OpenRouter](https://openrouter.ai/) でアカウント作成
2. API キーを取得
3. `.env` の `OPENROUTER_API_KEY` に設定

#### LINE Messaging API
1. [LINE Developers Console](https://developers.line.biz/) でアプリ作成
2. Messaging API を有効化
3. チャンネルアクセストークンとチャンネルシークレットを取得
4. `.env` の `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_CHANNEL_SECRET` に設定

### 4. データベース初期化

アプリケーション起動時に SQLite データベースが自動的に作成されます。

### 5. サーバー起動

```bash
# 開発モード
npm run dev

# 本番モード
npm start
```

### 6. 管理画面アクセス

ブラウザで `http://localhost:3000` にアクセスして管理画面を使用できます。

## 📱 LINE Bot 設定

### Webhook URL の設定

LINE Developers Console で以下の URL を設定：
```
https://your-domain.com/api/line/webhook
```

### LINE Bot コマンド

- **記事URL送信**: 即座に要約して返信
- **「設定」**: 現在の配信設定を確認
- **「配信時間 HH:MM」**: 配信時間を変更
- **「要約レベル level」**: brief/standard/detailed
- **「購読」**: 購読中のフィード一覧
- **「ヘルプ」**: 使用方法を表示

## 🗂️ プロジェクト構造

```
News_LINE/
├── src/
│   ├── services/
│   │   ├── database.js          # SQLite データベース管理
│   │   ├── feedParser.js        # RSS/Atom フィード解析
│   │   ├── scheduler.js         # 定期実行スケジューラー
│   │   ├── articleExtractor.js  # 記事内容抽出
│   │   ├── summarizer.js        # AI要約（日本語対応）
│   │   └── lineMessaging.js     # LINE Bot・ユーザー管理
│   ├── routes/
│   │   ├── articles.js          # 記事処理 API
│   │   ├── line.js              # LINE Bot webhook
│   │   └── admin.js             # 管理機能 API
│   ├── utils/
│   │   └── logger.js            # ログ管理
│   └── server.js                # Express サーバー
├── public/
│   ├── index.html               # 管理画面 UI
│   └── script.js                # フロントエンド JavaScript
├── data/                        # データベースファイル
├── logs/                        # ログファイル
├── package.json
├── CLAUDE.md                    # システム要件定義書
└── README.md
```

## 🧪 テスト機能

管理画面では以下のテスト機能が利用できます：

- **記事テスト**: URL を入力して要約をテスト
- **LINE テスト**: 指定ユーザーへのメッセージ送信テスト
- **完全処理テスト**: 記事取得→要約→LINE送信の全工程テスト
- **RSS フィードテスト**: フィード URL の解析テスト
- **スケジューラーテスト**: 各種スケジュール処理の手動実行

## 📊 API エンドポイント

### 記事処理 API
- `POST /api/articles/extract-from-url` - URL から記事抽出
- `POST /api/articles/summarize` - テキスト要約
- `POST /api/articles/process-and-send` - 完全処理・LINE送信

### LINE Bot API
- `POST /api/line/webhook` - LINE webhook
- `POST /api/line/send-summary` - 要約メッセージ送信

### 管理 API
- `GET /api/admin/stats` - システム統計
- `GET /api/admin/feeds` - RSS フィード一覧
- `POST /api/admin/feeds` - RSS フィード追加
- `GET /api/admin/users` - ユーザー一覧
- `GET /api/admin/articles` - 記事一覧
- `POST /api/admin/scheduler/*` - スケジューラー制御

## 🔧 運用

### 自動バックアップ
- SQLite データベース（data/news_line.db）
- ログファイル（logs/）

### 監視項目
- システム稼働状況
- RSS フィード取得状況
- LINE Bot 配信状況
- データベース使用量

### 定期メンテナンス
- 古い記事データのクリーンアップ（自動）
- ログファイルローテーション
- パフォーマンス監視

## 🐳 Docker での実行

```bash
# ビルド
docker build -t news-line .

# 実行
docker-compose up -d
```

## 📈 スケーリング計画

### Phase 3 (予定)
- 複数ソース対応の拡張
- 高度な要約機能
- 統計・分析機能強化

### Phase 4 (予定)
- パフォーマンス最適化
- UI/UX 改善
- 運用自動化強化

## 🤝 貢献

1. このリポジトリをフォーク
2. 機能ブランチを作成（`git checkout -b feature/amazing-feature`）
3. 変更をコミット（`git commit -m 'Add amazing feature'`）
4. ブランチにプッシュ（`git push origin feature/amazing-feature`）
5. プルリクエストを開く

## 📄 ライセンス

このプロジェクトは MIT ライセンスのもとで公開されています。

## 🙏 謝辞

- [OpenRouter](https://openrouter.ai/) - Gemini 2.5 Flash API 提供
- [LINE Developers](https://developers.line.biz/) - LINE Messaging API
- [Express.js](https://expressjs.com/) - Web フレームワーク
- [Bootstrap](https://getbootstrap.com/) - UI フレームワーク

---

**バージョン**: 2.0.0 (Phase 2 完了)  
**最終更新**: 2025-06-02