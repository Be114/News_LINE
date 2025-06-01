# News LINE - ニュース記事要約LINE送信システム

News LINE は、ウェブ上のニュース記事を自動的に要約し、LINE Messaging API を通じてユーザーに送信する Web アプリケーションです。

## 🚀 MVPバージョン機能

### ✅ 実装済み機能

- **記事取得・要約**: URL 入力による記事内容の抽出と AI 要約
- **LINE 送信**: LINE Messaging API を使用したメッセージ送信
- **Web 管理画面**: 基本的な管理とテスト機能
- **API エンドポイント**: RESTful API による操作
- **ログ管理**: 構造化ログとエラー追跡

### 📋 主要機能

1. **記事処理**
   - URL からの記事内容抽出
   - AI による要約（3レベル：簡潔版、標準版、詳細版）
   - キーワード抽出
   - フォールバック要約機能

2. **LINE 連携**
   - シンプルテキストメッセージ送信
   - Flex Message（リッチフォーマット）対応
   - Webhook 対応
   - ユーザーインタラクション処理

3. **管理機能**
   - Web ベース管理画面
   - システム統計表示
   - リアルタイム機能テスト
   - ログビューア

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

必要な環境変数：
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Bot のアクセストークン
- `LINE_CHANNEL_SECRET`: LINE Bot のチャンネルシークレット
- `OPENROUTER_API_KEY`: OpenRouter API キー（Gemini 2.5 Flash使用）
- `OPENROUTER_SITE_URL`: サイト URL（オプション）
- `OPENROUTER_SITE_NAME`: サイト名（オプション）

### 3. サーバーの起動

#### 開発モード
```bash
npm run dev
```

#### 本番モード
```bash
npm start
```

サーバーは `http://localhost:3000` で起動します。

## 📡 API エンドポイント

### 記事処理 API

- `POST /api/articles/extract` - URL から記事を抽出・要約
- `POST /api/articles/summarize` - テキストを要約
- `POST /api/articles/process-and-send` - 記事処理 + LINE 送信
- `GET /api/articles/health` - 記事処理サービスの状態確認

### LINE API

- `POST /api/line/webhook` - LINE Bot webhook
- `POST /api/line/send-message` - メッセージ送信（テスト用）
- `GET /api/line/config` - LINE 設定状態確認

### 管理 API

- `GET /api/admin/stats` - システム統計
- `POST /api/admin/test-article` - 記事処理テスト
- `POST /api/admin/test-line` - LINE 送信テスト
- `GET /api/admin/logs` - システムログ取得

## 🎯 使用方法

### 1. Web 管理画面

ブラウザで `http://localhost:3000` にアクセスして、管理画面を使用できます。

#### 機能：
- システム状態の監視
- 記事処理のテスト
- LINE メッセージ送信のテスト
- 完全処理フローのテスト
- システムログの確認

### 2. API 使用例

#### 記事要約の例

```bash
curl -X POST http://localhost:3000/api/articles/extract \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/news-article",
    "summaryLevel": "standard"
  }'
```

#### LINE 送信の例

```bash
curl -X POST http://localhost:3000/api/articles/process-and-send \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/news-article",
    "lineUserId": "U1234567890abcdef...",
    "summaryLevel": "standard",
    "useFlexMessage": true
  }'
```

### 3. LINE Bot 使用

LINE Bot を友達追加後：
1. ニュース記事の URL を送信
2. 自動的に要約が返信されます
3. 「ヘルプ」と送信すると使用方法が表示されます

## 🔧 設定

### LINE Bot 設定

1. [LINE Developers Console](https://developers.line.biz/) でアプリを作成
2. Messaging API を有効化
3. チャンネルアクセストークンとシークレットを取得
4. Webhook URL を設定: `https://your-domain.com/api/line/webhook`

### OpenRouter 設定（AI要約用）

1. [OpenRouter](https://openrouter.ai/) でアカウントを作成
2. API キーを取得
3. `.env` ファイルに設定

```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_SITE_URL=https://news-line-app.com  # オプション
OPENROUTER_SITE_NAME=News LINE                 # オプション
```

> **注意**: OpenRouter API キーが設定されていない場合、フォールバック要約機能が使用されます。
>
> **モデル**: Gemini 2.5 Flash (`google/gemini-2.5-flash-preview-05-20`) を使用します。

## 📊 監視・ログ

### ログファイル

- `logs/combined.log` - 全てのログ
- `logs/error.log` - エラーログのみ

### 健全性チェック

- `GET /health` - サーバーの基本状態
- `GET /api/articles/health` - 記事処理サービスの状態
- `GET /api/line/config` - LINE 設定状態

## 🔒 セキュリティ

### 実装済みセキュリティ機能

- Helmet.js による基本的なセキュリティヘッダー
- CORS 設定
- レート制限
- 入力検証
- 環境変数による秘密情報管理

### 追加推奨事項

- HTTPS 使用（本番環境）
- 定期的なセキュリティアップデート
- ログ監視
- APIキーの定期ローテーション

## 🚧 今後の開発予定

### Phase 2: 自動化機能
- RSS/Atom フィード対応
- 定期配信機能
- ユーザー設定機能

### Phase 3: 拡張機能
- 複数ソース対応
- 高度な要約機能
- 統計・分析機能

### Phase 4: 最適化
- パフォーマンス最適化
- UI/UX 改善
- 運用自動化

## 🤝 貢献

バグ報告や機能要求は Issue で受け付けています。プルリクエストも歓迎します。

## 📄 ライセンス

MIT License

## 📞 サポート

技術的な質問やサポートが必要な場合は、Issue を作成してください。

---

**作成日**: 2025-06-01  
**バージョン**: 1.0.0 (MVP)  
**更新日**: 2025-06-01