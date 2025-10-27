const axios = require('axios');

/**
 * Simple background pinger.
 * Pings configured URL at a configurable interval to keep the process reachable
 * Useful for platforms that require periodic activity to prevent cold starts.
 */
function startPinger(options = {}) {
  const defaultIntervalMs = 14.58 * 60 * 1000; // 14.58 minutes in ms (~874800 ms)
  const intervalMs = options.intervalMs || parseInt(process.env.PING_INTERVAL_MS, 10) || Math.round(defaultIntervalMs);

  // Default to explicit PING_URL, otherwise local health endpoint
  const url = options.url || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}/health`;

  let timer = null;

  const pingOnce = async () => {
    try {
      const res = await axios.get(url, { timeout: 5000 });
      console.log(`[pinger] ${new Date().toISOString()} pinged ${url} -> ${res.status}`);
    } catch (err) {
      console.warn(`[pinger] ${new Date().toISOString()} ping to ${url} failed: ${err.message}`);
    }
  };

  // Start immediately then interval
  (async () => {
    await pingOnce();
    timer = setInterval(pingOnce, intervalMs);
  })();

  // Allow graceful shutdown
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  process.on('exit', stop);
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  return { stop };
}

module.exports = { startPinger };
