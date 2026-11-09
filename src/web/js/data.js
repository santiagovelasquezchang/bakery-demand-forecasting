// Starting catalog. Once Supabase is connected the live catalog (edited by the baker in the portal) replaces it;
// supabase/migrations/0003_catalog.sql seeds the database with these same values.
// All products and prices are synthetic sample data.

const DEFAULT_CATALOG = {
  products: [
    {
      id: 'strawberry-daisy', name: 'Strawberry & Daisy Cake', tag: 'Fresh & Floral', image_url: 'assets/img/strawberry.svg',
      description: 'Silky white buttercream crowned with fresh strawberries, raspberries, lemon slices and little daisies. Light, bright and made for spring birthdays and brunches.',
      sizes: [{ id: '6', label: '6" · serves 10–12', price: 48 }, { id: '8', label: '8" · serves 20–24', price: 68 }],
      flavors: ['Vanilla', 'Strawberry', 'Lemon', 'Lemon Raspberry'],
    },
    {
      id: 'signature-red', name: 'Signature Red Vintage Cake', tag: 'Vintage Piping', image_url: 'assets/img/hero-red.svg',
      description: 'Our most-loved look: deep red buttercream with layered vintage shell piping and a hand-piped monogram. Bold, romantic and totally photo-ready.',
      sizes: [{ id: '6', label: '6" · serves 10–12', price: 58 }, { id: '8', label: '8" · serves 20–24', price: 78 }],
      flavors: ['Red Velvet', 'Vanilla', 'Chocolate', 'Marble (Chocolate & Vanilla)'],
    },
    {
      id: 'character-birthday', name: 'Character Birthday Cake', tag: 'Sculpted · Kids', image_url: 'assets/img/character.svg',
      description: 'A hand-sculpted character of your choice with a sprinkle party hat and a birthday plaque. Every face comes out a little different.',
      sizes: [{ id: '6', label: '6" · serves 10–12', price: 72 }],
      flavors: ['Vanilla', 'Chocolate', 'Marble (Chocolate & Vanilla)', 'Strawberry'],
    },
    {
      id: 'tres-leches', name: 'Tres Leches', tag: 'House Classic', image_url: null,
      description: 'Sponge cake soaked in three milks and topped with whipped cream. Sold by the portion or by the tray.',
      sizes: [{ id: 'portion', label: 'Single portion', price: 6 }, { id: '8x8', label: '8×8 tray · 8 portions', price: 40 }, { id: '9x12', label: '9×12 tray · 12 portions', price: 55 }],
      flavors: ['Vanilla', 'Chocolate', 'Marble', 'Strawberry'],
    },
    {
      id: 'pound-cake', name: 'Butter Pound Cake', tag: 'Bakery Treat', image_url: null,
      description: 'A tender, buttery loaf cake sold by the slice. Perfect with coffee.',
      sizes: [{ id: 'each', label: 'Slice', price: 3 }],
      flavors: null,
    },
  ],
  builder: {
    sizes: [
      { id: '6-1', label: '1 tier · 6"', detail: '', tiers: 1, diameters: [6], height: 4, price: 45 },
      { id: '8-1', label: '1 tier · 8"', detail: '', tiers: 1, diameters: [8], height: 4, price: 65 },
      { id: '2t', label: '2 tiers · 6" + 8"', detail: '', tiers: 2, diameters: [8, 6], height: 4, price: 120 },
      { id: '3t', label: '3 tiers · 6" + 8" + 10"', detail: '', tiers: 3, diameters: [10, 8, 6], height: 4, price: 220 },
    ],
    shapes: [{ id: 'round', label: 'Round', price: 0 }, { id: 'square', label: 'Square', price: 10 }],
    flavors: [
      ['vanilla', 'Vanilla'], ['chocolate', 'Chocolate'], ['orange', 'Orange'], ['lemon', 'Lemon'], ['strawberry', 'Strawberry'],
      ['red-velvet', 'Red Velvet'], ['marble', 'Marble (Chocolate & Vanilla)'], ['lemon-blueberry', 'Lemon Blueberry'],
      ['lemon-raspberry', 'Lemon Raspberry'], ['carrot', 'Carrot Cake'], ['apple-walnut', 'Apple & Walnut'],
    ].map(([id, label]) => ({ id, label, price: 0 })).concat([
      ['tl-vanilla', 'Tres Leches Vanilla'], ['tl-chocolate', 'Tres Leches Chocolate'],
      ['tl-marble', 'Tres Leches Marble'], ['tl-strawberry', 'Tres Leches Strawberry'],
    ].map(([id, label]) => ({ id, label, price: 10 }))),
    fillings: [
      { id: 'buttercream', label: 'Vanilla buttercream', detail: 'Classic & light', price: 0 },
      { id: 'jam', label: 'Strawberry jam', detail: 'House-made', price: 0 },
      { id: 'dulce', label: 'Dulce de leche', detail: 'Rich caramel', price: 5 },
      { id: 'creamcheese', label: 'Cream cheese', detail: 'Tangy & smooth', price: 5 },
      { id: 'ganache', label: 'Chocolate ganache', detail: 'Dark & silky', price: 5 },
      { id: 'lemoncurd', label: 'Lemon curd', detail: 'Bright & zesty', price: 5 },
      { id: 'strawberries', label: 'Fresh strawberries & cream', detail: 'Seasonal', price: 8 },
    ],
    styles: [
      { id: 'smooth', label: 'Smooth Buttercream', detail: 'Clean, classic finish', price: 0, look: 'smooth' },
      { id: 'naked', label: 'Semi-Naked', detail: 'Rustic, layers peek through', price: 0, look: 'naked' },
      { id: 'vintage', label: 'Vintage Piping', detail: 'Our signature shells & ruffles', price: 20, look: 'vintage' },
      { id: 'drip', label: 'Chocolate Drip', detail: 'Glossy ganache drip', price: 12, look: 'drip' },
      { id: 'fruit', label: 'Fresh Fruit & Flowers', detail: 'Berries, citrus & edible blooms', price: 18, look: 'fruit' },
      { id: 'floral', label: 'Buttercream Florals', detail: 'Hand-piped roses', price: 25, look: 'floral' },
    ],
    colors: [
      { id: 'white', label: 'Classic White', hex: '#FFFBF3', price: 0 },
      { id: 'blush', label: 'Blush Pink', hex: '#F4C6CF', price: 0 },
      { id: 'red', label: 'Signature Red', hex: '#A31B3B', price: 0 },
      { id: 'lavender', label: 'Lavender', hex: '#CDB9E3', price: 0 },
      { id: 'sky', label: 'Sky Blue', hex: '#BFD9EE', price: 0 },
      { id: 'butter', label: 'Buttercup', hex: '#F6E08F', price: 0 },
      { id: 'sage', label: 'Sage', hex: '#C5D4B5', price: 0 },
      { id: 'cocoa', label: 'Cocoa', hex: '#8A5A44', price: 0 },
    ],
    accents: [
      { id: 'none', label: 'No metallic accent', price: 0 },
      { id: 'gold', label: 'Gold accents', price: 8, hex: '#C9A24B' },
      { id: 'silver', label: 'Silver accents', price: 8, hex: '#B8BCC4' },
    ],
    toppers: [
      { id: 'none', label: 'No topper', detail: '', price: 0, look: 'none' },
      { id: 'hbd', label: '"Happy Birthday" script topper', detail: 'Gold acrylic', price: 8, look: 'hbd' },
      { id: 'numbers', label: 'Number candles', detail: 'Tell us the number in the message', price: 4, look: 'numbers' },
      { id: 'name', label: 'Custom name topper', detail: 'Acrylic, your text', price: 18, look: 'name' },
      { id: 'flowers', label: 'Fresh flower crown', detail: 'Seasonal blooms', price: 15, look: 'flowers' },
    ],
  },
  settings: {
    lead_days: { ready: 7, custom: 7 },
    cafe: { name: "Sample Bakery & Café", address: '', hours: '', note: 'Fresh coffee, treats and cake by the slice.' },
    portions: { party: 14, wedding: 8 },
    deposit: { percent: 50 },
  },
};

// Option groups as stored in the database (builder_options.grp) ↔ keys used by the builder.
const OPTION_GROUPS = {
  size: 'sizes', shape: 'shapes', flavor: 'flavors', filling: 'fillings',
  style: 'styles', color: 'colors', accent: 'accents', topper: 'toppers',
};

let PRODUCTS;
let BUILDER;
let SITE;

function applyCatalog(c) {
  PRODUCTS = c.products.map((p) => ({ ...p, image: p.image_url || null }));
  BUILDER = { ...c.builder };
  SITE = {
    leadReady: Number(c.settings.lead_days?.ready ?? 7),
    leadCustom: Number(c.settings.lead_days?.custom ?? 7),
    cafe: c.settings.cafe || {},
    portions: { party: Number(c.settings.portions?.party) || 14, wedding: Number(c.settings.portions?.wedding) || 8 },
    depositPct: Number(c.settings.deposit?.percent ?? 50),
  };
  BUILDER.minLeadDays = SITE.leadCustom;
}

function catalogFromRows({ products, options, settings }) {
  const builder = Object.fromEntries(Object.values(OPTION_GROUPS).map((g) => [g, []]));
  for (const o of options) {
    const g = OPTION_GROUPS[o.grp];
    if (g) builder[g].push({ id: o.key, label: o.label, detail: o.detail || '', price: Number(o.price), ...o.meta });
  }
  return {
    products: products.map((p) => ({ ...p, sizes: p.sizes.map((s) => ({ ...s, price: Number(s.price) })) })),
    builder,
    settings: { ...DEFAULT_CATALOG.settings, ...settings },
  };
}

async function loadCatalog() {
  if (typeof sb === 'undefined' || !sb) { applyCatalog(DEFAULT_CATALOG); return; }
  const { data, error } = await sb.rpc('public_catalog');
  if (error) {
    console.warn('Could not load live catalog, using defaults', error);
    applyCatalog(DEFAULT_CATALOG);
    return;
  }
  applyCatalog(catalogFromRows(data));
}

const GALLERY = [
  { src: 'assets/img/wedding.svg', title: 'Rose & Pearl Wedding Cake', cats: ['wedding'] },
  { src: 'assets/img/hero-red.svg', title: 'Signature Red Vintage Cake', cats: ['vintage', 'birthday'] },
  { src: 'assets/img/quinceanera.svg', title: 'Quinceañera Tiered Cake', cats: ['quinceanera'] },
  { src: 'assets/img/strawberry.svg', title: 'Strawberry & Daisy Cake', cats: ['fresh'] },
  { src: 'assets/img/character.svg', title: 'Character Birthday', cats: ['birthday', 'kids'] },
];

const GALLERY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'quinceanera', label: 'Quinceañera' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'kids', label: "Kid's & Sculpted" },
  { id: 'vintage', label: 'Vintage' },
  { id: 'fresh', label: 'Fresh & Floral' },
];
