/**
 * Local HTTP server for the H&M Tallinn T-Shirt API.
 * Run:  node hm-tallinn-server.js
 * Then open: http://localhost:3000
 */

const http = require('http');
const {
  fetchTallinnStores,
  searchTshirts,
  checkStoreAvailability,
  fetchTshirtsWithTallinnAvailability,
} = require('./hm-tallinn-tshirt-api');

const PORT = 3000;

// ─── Route handlers ───────────────────────────────────────────────────────────

const ROUTES = {
  // GET /stores
  // List all H&M stores in Tallinn.
  '/stores': async (_params) => fetchTallinnStores(),

  // GET /tshirts?page=0&pageSize=12&sort=RELEVANCE&gender=men
  // Search t-shirts in the Estonia catalogue.
  '/tshirts': async (params) =>
    searchTshirts({
      page: Number(params.get('page') ?? 0),
      pageSize: Number(params.get('pageSize') ?? 12),
      sort: params.get('sort') ?? 'RELEVANCE',
      gender: params.get('gender') ?? undefined,
    }),

  // GET /availability?productId=0968277_001&storeId=<storeId>
  // Check stock for a product in a specific Tallinn store.
  '/availability': async (params) => {
    const productId = params.get('productId');
    const storeId = params.get('storeId');
    if (!productId || !storeId) {
      throw Object.assign(new Error('productId and storeId are required'), { status: 400 });
    }
    return checkStoreAvailability(productId, storeId);
  },

  // GET /tshirts-with-availability?page=0&pageSize=6&gender=women
  // T-shirts annotated with Tallinn store availability.
  '/tshirts-with-availability': async (params) =>
    fetchTshirtsWithTallinnAvailability({
      page: Number(params.get('page') ?? 0),
      pageSize: Number(params.get('pageSize') ?? 6),
      sort: params.get('sort') ?? 'RELEVANCE',
      gender: params.get('gender') ?? undefined,
    }),
};

// ─── Index page ───────────────────────────────────────────────────────────────

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>H&amp;M Tallinn T-Shirt API</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #222; }
    h1 { font-size: 1.6rem; }
    h2 { margin-top: 2rem; font-size: 1.1rem; color: #444; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: .9em; }
    pre  { background: #f4f4f4; padding: 14px; border-radius: 6px; overflow-x: auto; }
    a    { color: #c40931; }
    .endpoint { border-left: 3px solid #c40931; padding-left: 12px; margin: 1rem 0; }
    .tag { display: inline-block; background: #c40931; color: #fff; font-size: .7rem;
           padding: 2px 7px; border-radius: 3px; vertical-align: middle; margin-right: 6px; }
    #result { white-space: pre-wrap; min-height: 60px; }
  </style>
</head>
<body>
  <h1>H&amp;M Tallinn T-Shirt API <span style="font-size:.9rem;color:#888">localhost:${PORT}</span></h1>

  <h2>Endpoints</h2>

  <div class="endpoint">
    <span class="tag">GET</span>
    <a href="/stores" target="_blank">/stores</a> — all H&amp;M locations in Tallinn
  </div>

  <div class="endpoint">
    <span class="tag">GET</span>
    <a href="/tshirts?pageSize=6" target="_blank">/tshirts</a>
    — search t-shirts &nbsp;
    <code>?page=0&amp;pageSize=12&amp;sort=RELEVANCE&amp;gender=men|women|kids</code>
  </div>

  <div class="endpoint">
    <span class="tag">GET</span>
    <code>/availability?productId=&lt;id&gt;&amp;storeId=&lt;id&gt;</code>
    — stock check for a product in one store
  </div>

  <div class="endpoint">
    <span class="tag">GET</span>
    <a href="/tshirts-with-availability?pageSize=3" target="_blank">/tshirts-with-availability</a>
    — t-shirts annotated with per-store availability
    <code>?pageSize=3</code>
  </div>

  <h2>Try it</h2>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    <button onclick="call('/stores')">Stores</button>
    <button onclick="call('/tshirts?pageSize=6')">T-shirts (6)</button>
    <button onclick="call('/tshirts?gender=men&pageSize=6')">Men (6)</button>
    <button onclick="call('/tshirts?gender=women&pageSize=6')">Women (6)</button>
    <button onclick="call('/tshirts-with-availability?pageSize=3')">With availability (3)</button>
  </div>
  <pre id="result">← click a button or visit an endpoint above</pre>

  <script>
    async function call(path) {
      const el = document.getElementById('result');
      el.textContent = 'Loading…';
      try {
        const res = await fetch(path);
        const data = await res.json();
        el.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        el.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const params = url.searchParams;

  // Serve the index page
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(INDEX_HTML);
    return;
  }

  const handler = ROUTES[path];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown route: ${path}` }));
    return;
  }

  try {
    const result = await handler(params);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(result, null, 2));
  } catch (err) {
    const status = err.status ?? 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`H&M Tallinn T-Shirt API running at http://localhost:${PORT}`);
  console.log('');
  console.log('  GET /stores');
  console.log('  GET /tshirts?page=0&pageSize=12&sort=RELEVANCE&gender=men|women|kids');
  console.log('  GET /availability?productId=<id>&storeId=<id>');
  console.log('  GET /tshirts-with-availability?pageSize=6');
  console.log('');
  console.log('Press Ctrl+C to stop.');
});
