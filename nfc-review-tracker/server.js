require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { supabase } = require('./lib/supabaseClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(404).end());
app.get('/', (req, res) => res.redirect('/dashboard.html'));

function genCode() {
  return crypto.randomBytes(4).toString('hex');
}

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(todayStr(d));
  }
  return days;
}

function weeklyReviewBuckets(snapshotsAsc, weeksCount = 8) {
  const buckets = [];
  for (let w = weeksCount - 1; w >= 0; w--) {
    const endDate = new Date(); endDate.setDate(endDate.getDate() - w * 7);
    const endStr = todayStr(endDate);
    let latest = null;
    for (const s of snapshotsAsc) {
      if (s.date <= endStr) latest = s;
      else break;
    }
    const label = w === 0 ? '今週' : w === 1 ? '先週' : `${w}週間前`;
    buckets.push({ label, end: endStr, reviewCount: latest ? latest.review_count : null });
  }
  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1].reviewCount;
    const cur = buckets[i].reviewCount;
    buckets[i].delta = (prev !== null && cur !== null) ? cur - prev : null;
  }
  buckets[0].delta = null;
  return buckets;
}

// 同じカードからの短時間の連続アクセス(二重タップ、ブラウザの先読みなど)を
// 誤カウントしないよう、直近のアクセス時刻をメモリ上に保持しておく。
// ※サーバーレス環境では実行インスタンスごとにリセットされるため完全ではないが、
//   よくある「一瞬で2回リダイレクトが走る」ケースの大半はこれで防げる。
const recentHits = new Map();
const DUPLICATE_GUARD_MS = 2000;

function extractPlaceId(url) {
  try {
    const u = new URL(url);
    const fromQuery = u.searchParams.get('placeid') || u.searchParams.get('place_id');
    if (fromQuery) return fromQuery;
    const match = url.match(/ChIJ[a-zA-Z0-9_-]+/); // GoogleのPlace IDは大抵 "ChIJ" で始まる
    if (match) return match[0];
  } catch (e) { /* URLとして不正な場合は諦める */ }
  return null;
}

// ---- 1. 計測付きリダイレクト ----
app.get('/r/:code', async (req, res) => {
  if (req.params.code === 'favicon.ico') {
    return res.status(404).end();
  }

  const now = Date.now();
  const lastHit = recentHits.get(req.params.code);
  const isDuplicate = lastHit && (now - lastHit) < DUPLICATE_GUARD_MS;
  recentHits.set(req.params.code, now);

  const { data: store, error } = await supabase
    .from('stores').select('*').eq('code', req.params.code).maybeSingle();

  if (error) { console.error(error); return res.status(500).send('サーバーエラーです。'); }
  if (!store) return res.status(404).send('このカードは登録されていません。');

  if (!isDuplicate) {
    await supabase.from('clicks').insert({
      store_id: store.id,
      date: todayStr(),
      ua: req.headers['user-agent'] || null
    });
  }

  res.redirect(302, store.target_url);
});

// ---- 2. 店舗管理API ----
app.get('/api/stores', async (req, res) => {
  const { data, error } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const origin = `${req.protocol}://${req.get('host')}`;
  res.json(data.map(s => ({
    id: s.id, name: s.name, targetUrl: s.target_url, placeId: s.place_id,
    code: s.code, createdAt: s.created_at, redirectUrl: `${origin}/r/${s.code}`
  })));
});

app.post('/api/stores', async (req, res) => {
  const { name, targetUrl, placeId } = req.body;
  if (!name || !targetUrl) return res.status(400).json({ error: 'name と targetUrl は必須です' });
  if (!/^https?:\/\//.test(targetUrl)) return res.status(400).json({ error: 'targetUrl は http(s):// で始まる必要があります' });

  const resolvedPlaceId = placeId || extractPlaceId(targetUrl);

  const { data, error } = await supabase
    .from('stores')
    .insert({ name, target_url: targetUrl, place_id: resolvedPlaceId, code: genCode() })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });

  const origin = `${req.protocol}://${req.get('host')}`;
  res.status(201).json({
    id: data.id, name: data.name, targetUrl: data.target_url, placeId: data.place_id,
    code: data.code, createdAt: data.created_at, redirectUrl: `${origin}/r/${data.code}`
  });
});

app.delete('/api/stores/:id', async (req, res) => {
  const { error } = await supabase.from('stores').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

// ---- 3. アクセス統計 ----
app.get('/api/stores/:id/stats', async (req, res) => {
  const storeId = req.params.id;
  const days56 = lastNDays(56); // CVR計算(直近8週間)にも使うため56日分取得
  const since = days56[0];

  const { data: clicks, error } = await supabase
    .from('clicks').select('date').eq('store_id', storeId).gte('date', since);
  if (error) return res.status(500).json({ error: error.message });

  const counts = Object.fromEntries(days56.map(d => [d, 0]));
  clicks.forEach(c => { if (counts[c.date] !== undefined) counts[c.date]++; });

  const days = days56.slice(-30);
  const daily = days.map(d => ({ date: d, count: counts[d] }));
  const sum = arr => arr.reduce((a, d) => a + counts[d], 0);
  const thisWeek = sum(days.slice(-7));
  const lastWeek = sum(days.slice(-14, -7));
  const deltaCount = thisWeek - lastWeek;
  const deltaPercent = lastWeek === 0 ? null : Math.round((deltaCount / lastWeek) * 100);

  // CVR(タップ数に対するレビュー転換率)用に、直近8週間の週別タップ数も算出しておく
  const weeklyTaps = [];
  for (let w = 7; w >= 0; w--) {
    const endDate = new Date(); endDate.setDate(endDate.getDate() - w * 7);
    const startDate = new Date(); startDate.setDate(startDate.getDate() - (w * 7 + 6));
    const endStr = todayStr(endDate);
    const startStr = todayStr(startDate);
    let count = 0;
    for (const d of days56) { if (d >= startStr && d <= endStr) count += counts[d]; }
    weeklyTaps.push({ end: endStr, count });
  }

  res.json({ daily, thisWeek, lastWeek, deltaCount, deltaPercent, weeklyTaps });
});

// ---- 4. レビュー数の推移 ----
app.get('/api/stores/:id/reviews', async (req, res) => {
  const storeId = req.params.id;

  const { data: store } = await supabase.from('stores').select('place_id').eq('id', storeId).maybeSingle();
  const { data: rows, error } = await supabase
    .from('review_snapshots').select('date, review_count, rating')
    .eq('store_id', storeId).order('date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const snapshots = rows.map(r => ({ date: r.date, reviewCount: r.review_count, rating: r.rating }));

  let deltaCount = null;
  if (snapshots.length >= 2) {
    const latest = snapshots[snapshots.length - 1];
    const latestDate = new Date(latest.date);
    let baseline = null;
    for (let i = snapshots.length - 2; i >= 0; i--) {
      const diffDays = (latestDate - new Date(snapshots[i].date)) / 86400000;
      if (diffDays >= 6.5) { baseline = snapshots[i]; break; }
    }
    if (baseline) deltaCount = latest.reviewCount - baseline.reviewCount;
  }

  const weeklySource = snapshots.map(s => ({ date: s.date, review_count: s.reviewCount }));
  res.json({
    snapshots, deltaCount, hasPlaceId: !!(store && store.place_id),
    weekly: weeklyReviewBuckets(weeklySource, 8)
  });
});

// ---- 5. レビュー数スナップショット取得 ----
// Vercel Cronは自動でGETリクエストを送り、CRON_SECRETを設定していれば
// "Authorization: Bearer <CRON_SECRET>" ヘッダーを自動で付与してくれる。
// 手動でcurl等から叩く場合は x-cron-secret ヘッダーでもOKにしてある。
app.all('/api/cron/snapshot-reviews', async (req, res) => {
  if (process.env.CRON_SECRET) {
    const bearer = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
    const manual = req.headers['x-cron-secret'] === process.env.CRON_SECRET;
    if (!bearer && !manual) return res.status(401).json({ error: 'unauthorized' });
  }

  const { fetchGoogleReviewCount } = require('./lib/reviews');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const today = todayStr();

  const { data: stores, error } = await supabase.from('stores').select('*').not('place_id', 'is', null);
  if (error) return res.status(500).json({ error: error.message });

  const results = [];
  for (const store of stores) {
    try {
      const { reviewCount, rating } = await fetchGoogleReviewCount(store.place_id, apiKey);
      await supabase.from('review_snapshots')
        .upsert({ store_id: store.id, date: today, review_count: reviewCount, rating }, { onConflict: 'store_id,date' });
      results.push({ store: store.name, reviewCount, rating, ok: true });
    } catch (err) {
      results.push({ store: store.name, ok: false, error: err.message });
    }
  }

  res.json({ ran: today, results });
});

// ローカルで `node server.js` を直接実行したときだけサーバーを起動する。
// Vercel(サーバーレス)から読み込まれるときは app をそのままexportする。
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ サーバー起動: http://localhost:${PORT}`);
    console.log(`   管理ダッシュボード: http://localhost:${PORT}/dashboard.html`);
  });
}

module.exports = app;
