exports.handler = async () => {
  try {
    const res = await fetch(
      "https://hub.torquedma.com/.netlify/functions/decode-vin-background?limit=all"
    );
    console.log("[decode-vin-cron] triggered decode-vin-background, status:", res.status);
    return { statusCode: 200, body: "decode-vin-background triggered" };
  } catch (err) {
    console.error("[decode-vin-cron] failed to trigger:", err.message);
    return { statusCode: 500, body: "trigger failed: " + err.message };
  }
};
