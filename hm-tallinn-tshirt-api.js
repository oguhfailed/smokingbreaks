/**
 * H&M Tallinn T-Shirt API
 *
 * Fetches t-shirt products from H&M using their public API,
 * scoped to stores in Tallinn, Estonia.
 *
 * Works in both Node.js (v18+) and modern browsers.
 */

const HM_API_BASE = 'https://api.hm.com';
const LOCALE = 'en_EE'; // English, Estonia
const COUNTRY = 'EE';

// ─── Store helpers ────────────────────────────────────────────────────────────

/**
 * Fetch all H&M stores located in Tallinn.
 *
 * @returns {Promise<Array>} Array of store objects.
 */
async function fetchTallinnStores() {
  const url = new URL(`${HM_API_BASE}/store-services/v1/${LOCALE}/stores`);
  url.searchParams.set('country', COUNTRY);
  url.searchParams.set('q', 'Tallinn');
  url.searchParams.set('view', 'list');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch stores: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.stores ?? data ?? [];
}

// ─── Product search ───────────────────────────────────────────────────────────

/**
 * Search for t-shirts in the H&M Estonia catalogue.
 *
 * @param {object} [options]
 * @param {number} [options.page=0]       Zero-based page index.
 * @param {number} [options.pageSize=36]  Number of results per page.
 * @param {string} [options.sort='RELEVANCE'] Sort order: RELEVANCE | PRICE_ASC | PRICE_DESC | NEWEST.
 * @param {string} [options.gender]       Filter by gender: 'men' | 'women' | 'kids'.
 * @returns {Promise<{products: Array, totalCount: number, page: number, pageSize: number}>}
 */
async function searchTshirts({ page = 0, pageSize = 36, sort = 'RELEVANCE', gender } = {}) {
  const url = new URL(`${HM_API_BASE}/search-services/v1/${LOCALE}/listing/api/search`);
  url.searchParams.set('query', 't-shirt');
  url.searchParams.set('page-index', page);
  url.searchParams.set('page-size', pageSize);
  url.searchParams.set('sort', sort);
  url.searchParams.set('country', COUNTRY);

  if (gender) {
    url.searchParams.set('filters', `categories:${gender}_tshirts_tops`);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Product search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    products: data.results ?? data.products ?? [],
    totalCount: data.pagination?.totalNumberOfResults ?? data.total ?? 0,
    page,
    pageSize,
  };
}

// ─── Store availability ───────────────────────────────────────────────────────

/**
 * Check whether a specific product is available in a Tallinn H&M store.
 *
 * @param {string} productId  H&M product article code (e.g. "0968277_001").
 * @param {string} storeId    H&M store ID obtained from fetchTallinnStores().
 * @returns {Promise<{available: boolean, sizes: Array}>}
 */
async function checkStoreAvailability(productId, storeId) {
  const url = new URL(
    `${HM_API_BASE}/store-services/v1/${LOCALE}/availability/${productId}`
  );
  url.searchParams.set('storeId', storeId);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `Availability check failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const sizes = data.availableSizes ?? data.sizes ?? [];

  return {
    available: sizes.length > 0,
    sizes,
    storeId,
    productId,
  };
}

// ─── Convenience: t-shirts available in any Tallinn store ────────────────────

/**
 * Fetch t-shirts and annotate each with Tallinn store availability.
 *
 * Because this calls the availability endpoint once per product, use a small
 * pageSize (e.g. 10) to avoid flooding the API.
 *
 * @param {object} [searchOptions]  Same options as searchTshirts().
 * @returns {Promise<Array>} Products with an added `storeAvailability` field.
 */
async function fetchTshirtsWithTallinnAvailability(searchOptions = {}) {
  const [{ products }, stores] = await Promise.all([
    searchTshirts(searchOptions),
    fetchTallinnStores(),
  ]);

  if (stores.length === 0) {
    throw new Error('No H&M stores found in Tallinn.');
  }

  // Check availability for each product across all Tallinn stores in parallel.
  const annotated = await Promise.all(
    products.map(async (product) => {
      const availabilityChecks = await Promise.all(
        stores.map((store) =>
          checkStoreAvailability(product.articleCode ?? product.id, store.id).catch(() => null)
        )
      );

      return {
        ...product,
        storeAvailability: availabilityChecks
          .filter(Boolean)
          .map((avail, i) => ({ store: stores[i], ...avail })),
      };
    })
  );

  return annotated;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  fetchTallinnStores,
  searchTshirts,
  checkStoreAvailability,
  fetchTshirtsWithTallinnAvailability,
};
