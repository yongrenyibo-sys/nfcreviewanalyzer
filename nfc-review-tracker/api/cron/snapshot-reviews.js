// Vercel Cron は GET でエンドポイントを叩く仕様なので、
// server.js の POST /api/cron/snapshot-reviews に内部転送するだけの薄い関数。
const app = require('../../server');

module.exports = (req, res) => {
  req.method = 'POST';
  if (process.env.CRON_SECRET) {
    req.headers['x-cron-secret'] = process.env.CRON_SECRET;
  }
  app(req, res);
};
