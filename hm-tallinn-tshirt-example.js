/**
 * Example usage of the H&M Tallinn T-Shirt API.
 * Run with: node hm-tallinn-tshirt-example.js
 */

const {
  fetchTallinnStores,
  searchTshirts,
  checkStoreAvailability,
  fetchTshirtsWithTallinnAvailability,
} = require('./hm-tallinn-tshirt-api');

async function main() {
  // 1. List all H&M stores in Tallinn
  console.log('--- Tallinn H&M stores ---');
  const stores = await fetchTallinnStores();
  stores.forEach((s) => console.log(`  [${s.id}] ${s.name} — ${s.address?.street}`));

  // 2. Search for t-shirts (first page, 10 items)
  console.log('\n--- T-shirt search results ---');
  const { products, totalCount } = await searchTshirts({ pageSize: 10 });
  console.log(`Found ${totalCount} total results. Showing first ${products.length}:`);
  products.forEach((p) => {
    const price = p.price?.value ?? p.prices?.[0]?.value ?? 'N/A';
    console.log(`  ${p.name} — €${price}  [${p.articleCode ?? p.id}]`);
  });

  // 3. Check store availability for the first product in the first Tallinn store
  if (products.length > 0 && stores.length > 0) {
    const productId = products[0].articleCode ?? products[0].id;
    const storeId = stores[0].id;
    console.log(`\n--- Availability of "${products[0].name}" in ${stores[0].name} ---`);
    const avail = await checkStoreAvailability(productId, storeId);
    console.log(`  Available: ${avail.available}`);
    console.log(`  Sizes: ${avail.sizes.join(', ') || 'none'}`);
  }

  // 4. Full convenience call (small page to keep requests manageable)
  console.log('\n--- T-shirts with Tallinn availability (first 3) ---');
  const annotated = await fetchTshirtsWithTallinnAvailability({ pageSize: 3 });
  annotated.forEach((p) => {
    const inStock = p.storeAvailability.some((a) => a.available);
    console.log(`  ${p.name} — in Tallinn: ${inStock ? 'YES' : 'NO'}`);
  });
}

main().catch(console.error);
