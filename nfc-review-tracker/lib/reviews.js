// Google Places API (New) から、指定した Place ID の
// 現在のレビュー件数(userRatingCount)と評価(rating)を取得する。
//
// 事前準備:
// 1. Google Cloud Console でプロジェクトを作成し「Places API (New)」を有効化
// 2. APIキーを発行し、.env の GOOGLE_PLACES_API_KEY に設定
// 3. 店舗の Place ID は以下のツールで検索できる:
//    https://developers.google.com/maps/documentation/places/web-service/place-id
//
// 注意: Places APIは「現在の合計レビュー数」しか返さない。
// 履歴・推移を見るには、この関数を毎日1回呼び出してスナップショットとして
// 自分たちのDBに保存し続ける必要がある(scripts/snapshot-reviews.js が実施)。

async function fetchGoogleReviewCount(placeId, apiKey) {
  if (!placeId) throw new Error('placeId が未設定です');
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY が未設定です');

  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=userRatingCount,rating,displayName`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'userRatingCount,rating,displayName'
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Places API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    reviewCount: data.userRatingCount ?? null,
    rating: data.rating ?? null,
    name: data.displayName?.text ?? null
  };
}

module.exports = { fetchGoogleReviewCount };
