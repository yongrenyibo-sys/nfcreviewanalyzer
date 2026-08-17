# NFCレビューカード計測ダッシュボード(Supabase + Vercel版)

データ保存先をJSONファイルからSupabase(データベース)に変更し、Vercelで公開できる構成にしました。

## 1. Supabaseのセットアップ

1. https://supabase.com でアカウント作成 → 「New project」でプロジェクトを作る
2. 左メニューの「SQL Editor」を開き、`supabase-schema.sql` の中身を貼り付けて実行(テーブルが3つ作られます)
3. 左メニューの「Project Settings」→「API」を開き、以下をメモする
   - **Project URL**(例: `https://xxxxx.supabase.co`)
   - **service_role キー**(`anon` キーではなく `service_role` の方。これはサーバー専用の強い権限を持つ鍵なので、絶対に公開しないこと)

## 2. ローカルで動作確認

`.env.example` を `.env` にコピーし、上でメモした値を入れる:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxxxxxxxxx
GOOGLE_PLACES_API_KEY=（任意）
CRON_SECRET=（任意・好きな文字列でOK）
```

```bash
npm install
npm start
```

`http://localhost:3000/dashboard.html` でこれまで通り動作確認できます。データは今回からSupabase(クラウド上のDB)に保存されるので、**別のパソコンから同じ.envで動かしても同じデータが見えます**。

## 3. GitHubにアップロード

Vercelはコードのデプロイ元としてGitHubリポジトリを使うのが基本です。GitHub Desktop等でこのフォルダをリポジトリとして登録し、GitHub上にpushしてください(`.env`ファイルは絶対にpushしないでください — `.gitignore`に`.env`を追加しておくと安全です)。

```
.gitignore の中身の例:
node_modules
.env
```

## 4. Vercelへデプロイ

1. https://vercel.com でアカウント作成 → 「Add New Project」→ さきほどのGitHubリポジトリを選択してインポート
2. 「Environment Variables」に、`.env`と同じ内容(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `GOOGLE_PLACES_API_KEY` / `CRON_SECRET`)を1つずつ登録
3. 「Deploy」を押す。数分で `https://あなたのプロジェクト名.vercel.app` が発行されます

デプロイが終わったら `https://あなたのプロジェクト名.vercel.app/dashboard.html` にアクセスして動作確認してください。

## 5. レビュー数の自動記録(Vercel Cron)

`vercel.json` にすでにCron設定を入れてあります(毎日 UTC 0:00 = 日本時間 9:00 に自動実行)。Vercelにデプロイした時点で自動的に有効になります。手動で試したい場合は以下にアクセスしてください(POSTなのでブラウザから直接開くのではなく、Postmanやcurlで叩く形になります)。

```
curl -X POST https://あなたのプロジェクト名.vercel.app/api/cron/snapshot-reviews \
  -H "x-cron-secret: あなたのCRON_SECRET"
```

※ Vercelの無料プランではCronの実行頻度に制限があります(1日1回程度が目安)。今回の用途(1日1回のレビュー数チェック)にはちょうど合っています。

## 6. NFCカードに書き込むURL

ダッシュボードで発行される `https://あなたのプロジェクト名.vercel.app/r/xxxxxxxx` をそのままNFCタグに書き込んでください。独自ドメインを使いたい場合は、Vercelの「Settings > Domains」から接続できます。

## よくあるつまずきポイント

- **`service_role`キーとpublicの`anon`キーを間違えない** — `anon`キーだとRLS(行レベルセキュリティ)に阻まれて書き込みできません
- **`.env`をGitHubに絶対上げない** — 上げてしまった場合はSupabase側でキーを再発行してください
- **Vercelの環境変数を変更したら再デプロイが必要** — 「Deployments」タブから「Redeploy」を押してください
