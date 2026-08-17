const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。.env を確認してください。');
}

// service role キーはRLSを無視してフルアクセスできる、サーバー専用の鍵。
// 絶対にフロントエンド(ブラウザ側)のコードには埋め込まないこと。
const supabase = createClient(url, serviceRoleKey);

module.exports = { supabase };
