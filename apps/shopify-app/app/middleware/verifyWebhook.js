const crypto = require("crypto");

function verifyWebhook(req, res, next) {
  const hmac = req.get("x-shopify-hmac-sha256");

  if (!hmac || !req.body) {
    return res.status(401).json({ ok: false, error: "Missing webhook signature" });
  }

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(req.body)
    .digest("base64");

  const digestBuffer = Buffer.from(digest);
  const hmacBuffer = Buffer.from(hmac);

  if (digestBuffer.length !== hmacBuffer.length || !crypto.timingSafeEqual(digestBuffer, hmacBuffer)) {
    return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
  }

  return next();

}
module.exports = verifyWebhook;
