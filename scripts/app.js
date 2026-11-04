import { request } from "./api.js";

let products = [];
let customerCsrf = "";
let checkoutRequestId = crypto.randomUUID();

const $ = (s, root = document) => root.querySelector(s);
const page = document.body.dataset.page;
const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const date = (ms) =>
  new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const icons = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4 4"/>',
  bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M3 8l9 5v9M7 5.8l9 5"/>',
  truck:
    '<path d="M1 5h13v12H1zM14 9h5l4 5v3h-9"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  leaf: '<path d="M20 3C9 2 2 6 5 15c8 7 16-2 15-12ZM5 20 16 8"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-9 10-9 10s-9-5-9-10V6l9-4Z"/><path d="m8 11 3 3 5-5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
};
const icon = (name) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.box}</svg>`;
const product = (id) =>
  products.find((p) => p.id === id) ||
  orders?.flatMap((o) => o.products).find((item) => item.productId === id)
    ?.productSnapshot;
function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem("forma-" + key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem("forma-" + key, JSON.stringify(value));
  } catch {
    toast("Browser storage is unavailable. Changes will last for this visit.");
  }
}
let cart, orders, delivery;
let saved = read("saved", []);
let category = "All essentials",
  query = new URLSearchParams(location.search).get("q") || "",
  sort = "featured",
  savedOnly = new URLSearchParams(location.search).has("saved");
const categories = [
  "All essentials",
  "Home & living",
  "Clothing",
  "Kitchen",
  "Active & outdoor",
  "Accessories",
];
function categoryOf(p) {
  if (p.category) return p.category;
  const text = `${p.name} ${p.keywords.join(" ")}`.toLowerCase();
  if (/earring|jewelry|sunglass|hat|beanie/.test(text)) return "Accessories";
  if (/shoe|sneaker|sandal|ballet flat|basketball/.test(text))
    return "Active & outdoor";
  if (
    /apparel|t-shirt|tshirt|sweater|pants|shorts|dress|hoodie|polo|socks/.test(
      text,
    )
  )
    return "Clothing";
  if (
    /kitchen|cookware|dining|appliance|toaster|kettle|bowl|plate|blender/.test(
      text,
    )
  )
    return "Kitchen";
  return "Home & living";
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 3200);
}
function totalItems() {
  return cart.reduce((n, c) => n + c.quantity, 0);
}
function updateCount() {
  document
    .querySelectorAll("[data-cart-count]")
    .forEach((el) => (el.textContent = totalItems()));
}
function add(id, quantity = 1) {
  const available = products.find((p) => p.id === id && p.active);
  if (!available || available.stock === 0) {
    toast("This product is currently unavailable.");
    return;
  }
  const current = cart.find((c) => c.productId === id)?.quantity || 0;
  if (available.stock !== null && current + quantity > available.stock) {
    toast(
      `Only ${available.stock} available. Update the quantity in your bag.`,
    );
    return;
  }
  const item = cart.find((c) => c.productId === id);
  if (item) item.quantity = Math.min(99, item.quantity + quantity);
  else cart.push({ productId: id, quantity, deliveryOptionId: "1" });
  save("cart", cart);
  updateCount();
  toast("Added to your bag — a little everyday upgrade.");
}
function header() {
  return `<div class="announcement">A little more considered. A lot more everyday. <a href="index.html#catalog">Find your essentials ${icon("arrow")}</a></div><header class="site-header"><div class="header-inner"><a class="wordmark" href="index.html" aria-label="Forma home">forma<span>®</span></a><nav class="desktop-nav" aria-label="Main navigation"><a href="index.html#catalog" ${page === "index" ? 'aria-current="page"' : ""}>The shop</a><a href="index.html#collections">Collections</a><a href="index.html#our-approach">Our approach</a></nav><div class="header-actions"><button class="icon-button" data-action="search" aria-label="Search the shop" aria-expanded="false" aria-controls="site-search">${icon("search")}</button><a class="icon-button saved-link" href="index.html?saved=1#catalog" aria-label="Saved items">${icon("heart")}</a><a class="orders-nav" aria-label="My orders" href="orders.html" ${page === "orders" ? 'aria-current="page"' : ""}>${icon("box")}<span>My orders</span></a><a class="bag-link" href="checkout.html" aria-label="View shopping bag">${icon("bag")}<span class="bag-label">Bag</span><span data-cart-count>${totalItems()}</span></a><button class="icon-button mobile-menu" data-action="menu" aria-label="Open navigation" aria-expanded="false">${icon("menu")}</button></div></div><nav id="mobile-nav" aria-label="Mobile navigation" hidden><a href="index.html#catalog">The shop</a><a href="index.html#collections">Collections</a><a href="index.html#our-approach">Our approach</a><a href="orders.html">My orders</a><a href="index.html?saved=1#catalog">Saved items</a></nav><form id="site-search" class="header-search" hidden role="search"><label class="sr-only" for="global-search">Search products</label>${icon("search")}<input id="global-search" name="q" placeholder="What are you looking for?" autocomplete="off"><button class="button small">Search ${icon("arrow")}</button></form></header>`;
}
function footer() {
  return `<footer><div class="footer-top"><div><a class="wordmark" href="index.html">forma<span>®</span></a><p>Good things. For everyday living.</p></div><div class="footer-links"><a href="index.html#catalog">Explore the shop ${icon("arrow")}</a><a href="orders.html">Your orders ${icon("arrow")}</a><a href="index.html#faq">Questions, answered ${icon("arrow")}</a></div><p class="footer-note">A considered collection.<br>A simpler kind of shopping.</p></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Forma. Made for the everyday.</span><span>Thoughtfully chosen, simply enjoyed.</span><a href="/admin">Store admin</a><a href="#main">Back to top ↑</a></div></footer>`;
}
function card(p, i) {
  const active = saved.includes(p.id);
  return `<article class="product-card" style="--delay:${Math.min(i, 7) * 35}ms"><div class="product-visual"><button class="product-open" data-action="detail" data-id="${p.id}" aria-label="View ${escape(p.name)}"><img loading="lazy" src="${escape(p.image)}" alt="${escape(p.name)}"></button><span class="product-tag">${categoryOf(p) === "Kitchen" ? "For your home" : categoryOf(p) === "Clothing" ? "Everyday wear" : categoryOf(p) === "Home & living" ? "Live a little better" : "Everyday essentials"}</span><button class="save-button ${active ? "is-saved" : ""}" data-action="save" data-id="${p.id}" aria-label="Save ${escape(p.name)}" aria-pressed="${active}">${icon("heart")}</button><button class="quick-view" data-action="detail" data-id="${p.id}">Take a closer look ${icon("arrow")}</button></div><div class="product-meta"><span>${escape(categoryOf(p))}</span><span class="rating">${p.rating.count ? `<span aria-hidden="true">★</span> ${p.rating.stars.toFixed(1)} <small>(${p.rating.count.toLocaleString()})</small>` : "New arrival"}</span></div><button class="product-title" data-action="detail" data-id="${p.id}">${escape(p.name)}</button><div class="product-bottom"><strong>${money(p.priceCents)}</strong><button ${p.stock === 0 ? "disabled" : ""} class="add-button" data-action="add" data-id="${p.id}" aria-label="Add ${escape(p.name)} to bag">${p.stock === 0 ? "Sold out" : "Add to bag"} ${icon("plus")}</button></div></article>`;
}
function home() {
  return `<main id="main"><section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span></span> THE EVERYDAY, RECONSIDERED</div><h1>Good things.<br>For <em>everyday</em><br>living.</h1><p>Small upgrades. Better routines. Discover thoughtfully chosen essentials for the way you live.</p><a class="button" href="#catalog">Find your everyday ${icon("arrow")}</a><div class="hero-caption"><span class="short-line"></span> Less searching. More living.</div></div><div class="hero-art"><div class="art-grid"></div><span class="art-label">THE CONSIDERED COLLECTION / 01</span><div class="hero-circle"></div><img class="hero-kettle" src="images/products/electric-steel-hot-water-kettle-white.jpg" alt="White and steel kettle from the kitchen collection"><img class="hero-bowls" src="images/products/artistic-bowl-set-6-piece.jpg" alt="Artistic ceramic bowls and plates"><span class="art-star" aria-hidden="true">✳</span><div class="hero-stamp">Made for<br>the everyday.<span>GOOD FINDS, GREAT FEELING</span></div><a class="hero-product" href="#catalog" data-category="Kitchen"><span>Meet your new daily favorites</span><strong>The kitchen edit ${icon("arrow")}</strong></a><span class="art-index">01 — GOOD THINGS START HERE</span></div></section><div class="benefits wrap"><div>${icon("leaf")}<span>Thoughtfully chosen<span>Essentials with a purpose</span></span></div><div>${icon("box")}<span>Something for every day<span>Home, wardrobe & beyond</span></span></div><div>${icon("truck")}<span>Delivery, your way<span>Choose your pace at checkout</span></span></div><div>${icon("heart")}<span>Keep what you love<span>Save your favorites for later</span></span></div></div><section class="collections wrap" id="collections"><div class="section-heading"><div><span class="eyebrow">FIND YOUR KIND OF EVERYDAY</span><h2>A little of what you love.</h2></div><a class="text-link" href="#catalog" data-category="All essentials">Explore everything ${icon("arrow")}</a></div><div class="collection-grid"><a href="#catalog" class="collection-card collection-home" data-category="Home & living"><div><span>MAKE ROOM FOR GOOD THINGS</span><h3>At home,<br>at ease.</h3><span class="collection-cta">Home & living ${icon("arrow")}</span></div><img src="images/products/luxury-towel-set.jpg" alt="Soft white towels" loading="lazy"></a><a href="#catalog" class="collection-card collection-wear" data-category="Clothing"><div><span>YOUR DAILY ROTATION</span><h3>Wear it.<br>Live in it.</h3><span class="collection-cta">Everyday clothing ${icon("arrow")}</span></div><img src="images/products/men-cozy-fleece-hoodie-light-teal.jpg" alt="Teal fleece hoodie" loading="lazy"></a><a href="#catalog" class="collection-card collection-kitchen" data-category="Kitchen"><div><span>A BETTER DAILY RITUAL</span><h3>Good taste.<br>Great mornings.</h3><span class="collection-cta">The kitchen edit ${icon("arrow")}</span></div><img src="images/products/2-slot-toaster-white.jpg" alt="White two slot toaster" loading="lazy"></a></div></section><section class="catalog wrap" id="catalog"><div class="section-heading"><div><span class="eyebrow">THE GOOD FINDS</span><h2>Your everyday starts here.</h2></div><span class="catalog-note">Considered essentials. Refreshingly simple.</span></div><div class="catalog-controls"><div class="category-tabs" role="group" aria-label="Product categories">${categories.map((c) => `<button data-category="${c}" aria-pressed="${c === category}" class="category-tab">${c}</button>`).join("")}</div><button class="saved-filter ${savedOnly ? "active" : ""}" data-action="saved-filter" aria-pressed="${savedOnly}">${icon("heart")} Saved</button></div><div class="catalog-toolbar"><p id="result-count" aria-live="polite"></p><div class="catalog-tools"><label class="catalog-search">${icon("search")}<input id="catalog-search" type="search" value="${escape(query)}" placeholder="Find something good" aria-label="Search products"></label><label class="sort-label">Sort by <select id="sort" aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option><option value="name">Name: A–Z</option></select></label></div></div><div id="products" class="products-grid"></div></section><section class="approach wrap" id="our-approach"><div class="approach-art"><img src="images/products/artistic-bowl-set-6-piece.jpg" alt="A collection of blue patterned ceramic bowls" loading="lazy"><span>LESS, BUT BETTER.</span></div><div class="approach-copy"><span class="eyebrow">THE FORMA WAY</span><h2>Life happens in<br>the <em>little things.</em></h2><p>The first cup of the morning. Your favorite thing to wear. A home that feels like you. We believe the everyday deserves a little more consideration.</p><p>So we bring the useful, the comfortable, and the beautiful together. Good things you'll reach for, again and again.</p><a class="text-link" href="#collections">Find your next little upgrade ${icon("arrow")}</a></div></section><section id="faq" class="faq wrap"><div><span class="eyebrow">A FEW GOOD ANSWERS</span><h2>A simpler kind<br>of shopping.</h2></div><div class="faq-list"><details><summary>How do delivery options work?<span>+</span></summary><p>Choose standard delivery (7 days, free), expedited delivery (3 days, $4.99), or next-day delivery ($9.99) for each item in your bag. Your total updates before you confirm.</p></details><details><summary>Where can I find my saved items?<span>+</span></summary><p>Tap the heart on any product to save it. Open the heart in the navigation or the Saved filter to see your favorites. They're kept in this browser.</p></details><details><summary>How do I follow my order?<span>+</span></summary><p>Open My orders and select Track package next to an item. You'll find its estimated arrival and order timeline there.</p></details><details><summary>Is this a live checkout?<span>+</span></summary><p>Your bag is kept in this browser and demo orders are saved by the store. No payment is collected. Delivery statuses are updated manually by the store administrator.</p></details></div></section></main>`;
}
function renderProducts() {
  let list = products.filter(
    (p) =>
      (category === "All essentials" || categoryOf(p) === category) &&
      (!savedOnly || saved.includes(p.id)) &&
      `${p.name} ${p.keywords.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  if (sort === "low") list.sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "high") list.sort((a, b) => b.priceCents - a.priceCents);
  if (sort === "rating")
    list.sort(
      (a, b) =>
        b.rating.stars - a.rating.stars || b.rating.count - a.rating.count,
    );
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  $("#result-count").textContent =
    `${list.length} thoughtful finds${savedOnly ? " · Your saved items" : ""}${query ? ` for “${query}”` : ""}`;
  $("#products").innerHTML = list.length
    ? list.map(card).join("")
    : `<div class="empty-state">${icon(savedOnly ? "heart" : "search")}<h3>${savedOnly ? "Make room for your favorites." : "No finds just yet."}</h3><p>${savedOnly ? "Tap a heart on any product to keep it here." : "Try a different search or explore another collection."}</p><button class="button" data-action="reset">Explore all essentials ${icon("arrow")}</button></div>`;
  document
    .querySelectorAll(".category-tab")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.category === category),
    );
}
function empty(title, text) {
  return `<div class="empty-state panel">${icon("bag")}<h2>${title}</h2><p>${text}</p><a class="button" href="index.html#catalog">Find something good ${icon("arrow")}</a></div>`;
}
function totals() {
  const items = cart.reduce(
    (n, c) => n + product(c.productId).priceCents * c.quantity,
    0,
  );
  const shipping = cart.reduce(
    (n, c) => n + delivery.find((d) => d.id === c.deliveryOptionId).priceCents,
    0,
  );
  const tax = Math.round((items + shipping) * 0.1);
  return { items, shipping, tax, total: items + shipping + tax };
}
function checkout() {
  const t = totals();
  return `<main class="wrap inner-page" id="main"><a class="breadcrumb" href="index.html#catalog">← Keep exploring</a><div class="page-heading"><div><span class="eyebrow">YOUR EVERYDAY, ALMOST HERE</span><h1>A bag of good things<span class="heading-dot">.</span></h1></div><span class="count-label">${totalItems()} ${totalItems() === 1 ? "item" : "items"} in your bag</span></div>${
    !cart.length
      ? empty(
          "A little room for something good.",
          "Your bag is empty. Let’s find your next everyday favorite.",
        )
      : `<div class="checkout-layout"><div class="cart-list">${cart
          .map((c) => {
            const p = product(c.productId);
            return `<article class="cart-card panel"><div class="cart-product"><button class="cart-image" data-action="detail" data-id="${p.id}" aria-label="View ${escape(p.name)}"><img src="${escape(p.image)}" alt="${escape(p.name)}"></button><div><span class="eyebrow">${escape(categoryOf(p))}</span><h3>${escape(p.name)}</h3>${p.stock !== null && c.quantity > p.stock ? `<p class="stock-notice">Only ${p.stock} available. ${p.stock === 0 ? "Remove this item to continue." : "Reduce the quantity to continue."}</p>` : ""}<strong>${money(p.priceCents)}</strong><div class="quantity-actions"><div class="stepper"><button data-action="decrement" data-id="${p.id}" aria-label="Decrease quantity" ${c.quantity === 1 ? "disabled" : ""}>${icon("minus")}</button><span aria-label="Quantity">${c.quantity}</span><button data-action="increment" data-id="${p.id}" aria-label="Increase quantity" ${c.quantity === 99 || (p.stock !== null && c.quantity >= p.stock) ? "disabled" : ""}>${icon("plus")}</button></div><button class="text-button" data-action="remove" data-id="${p.id}">Remove</button></div></div><strong class="line-price">${money(p.priceCents * c.quantity)}</strong></div><fieldset class="delivery-options"><legend>${icon("truck")} Choose your delivery</legend>${delivery.map((d) => `<label class="delivery-choice ${c.deliveryOptionId === d.id ? "selected" : ""}"><input type="radio" name="delivery-${p.id}" data-id="${p.id}" value="${d.id}" ${c.deliveryOptionId === d.id ? "checked" : ""}><span><strong>${d.deliveryDays === 7 ? "Standard" : d.deliveryDays === 3 ? "Expedited" : "Next day"}</strong><small>${date(Date.now() + d.deliveryDays * 86400000)}</small></span><b>${d.priceCents ? money(d.priceCents) : "Free"}</b></label>`).join("")}</fieldset></article>`;
          })
          .join(
            "",
          )}</div><aside class="order-summary panel"><span class="eyebrow">THE FINAL DETAILS</span><h2>Order summary</h2><div class="summary-row"><span>Subtotal · ${totalItems()} items</span><span>${money(t.items)}</span></div><div class="summary-row"><span>Delivery</span><span>${t.shipping ? money(t.shipping) : "Free"}</span></div><div class="summary-row"><span>Estimated tax (10%)</span><span>${money(t.tax)}</span></div><div class="summary-total"><span>Total</span><strong>${money(t.total)}</strong></div><p class="local-note">${icon("shield")} Demo checkout. No payment is collected and no items will be shipped.</p><button class="button full" ${
          cart.some((c) => {
            const p = product(c.productId);
            return p.stock !== null && c.quantity > p.stock;
          })
            ? "disabled"
            : ""
        } data-action="place-order">Place demo order ${icon("arrow")}</button><p class="summary-caption">Your demo order is saved by the store.</p><details class="summary-help"><summary>How is my total calculated?</summary><p>Product prices × quantities, plus your selected delivery for each item. Estimated tax is 10% of the subtotal and delivery.</p></details></aside></div>`
  }</main>`;
}
function ordersPage() {
  return `<main class="wrap inner-page narrow" id="main"><a class="breadcrumb" href="index.html#catalog">← Back to the shop</a><div class="page-heading"><div><span class="eyebrow">GOOD THINGS, ON THEIR WAY</span><h1>Your orders<span class="heading-dot">.</span></h1><p>All your everyday upgrades, in one place.</p></div><span class="count-label">${orders.length} orders</span></div><p class="context-note">Orders are saved by the store. Delivery updates are managed manually by the store administrator.</p>${
    orders.length
      ? orders
          .map(
            (o) =>
              `<article class="order-panel panel"><div class="order-header"><div><span>ORDER PLACED</span><strong>${date(o.orderTimeMs)}</strong></div><div><span>ORDER TOTAL</span><strong>${money(o.totalCostCents)}</strong></div><div class="order-id"><span>${o.sample ? "SAMPLE ORDER" : "DEMO ORDER"} · ORDER ID</span><button class="text-button" data-action="copy" data-id="${escape(o.id)}" title="Copy full order ID">${escape(o.id.slice(0, 18))}… ${icon("copy")}</button></div></div>${o.products
                .map((c) => {
                  const p = c.productSnapshot || product(c.productId);
                  if (!p) return "";
                  return `<div class="order-item"><img src="${escape(p.image)}" alt="${escape(p.name)}"><div class="order-product-info"><span class="status-badge">${escape(statusLabel(c.status))}</span><h3>${escape(p.name)}</h3><p>Quantity: ${c.quantity} <span>·</span> Estimated arrival: ${date(c.estimatedDeliveryTimeMs)}</p><button class="text-button" data-action="add" data-id="${p.id}" ${!products.some((x) => x.id === p.id) || p.stock === 0 ? "disabled" : ""}>${icon("plus")} ${products.some((x) => x.id === p.id) ? "Add to bag again" : "No longer in collection"}</button></div><a class="button secondary small" href="tracking.html?orderId=${encodeURIComponent(o.id)}&productId=${p.id}">Track package ${icon("arrow")}</a></div>`;
                })
                .join("")}</article>`,
          )
          .join("")
      : empty(
          "Your next chapter starts here.",
          "Once you place an order, you’ll find it right here.",
        )
  }</main>`;
}
function tracking() {
  const params = new URLSearchParams(location.search);
  const o = params.has("orderId")
    ? orders.find((o) => o.id === params.get("orderId"))
    : orders[0];
  const item =
    o &&
    (params.has("productId")
      ? o.products.find((p) => p.productId === params.get("productId"))
      : o.products[0]);
  if (!item || !product(item.productId))
    return `<main class="wrap inner-page" id="main">${empty("We couldn’t find that order.", "Visit your orders to choose a package to track.")}</main>`;
  const p = item.productSnapshot || product(item.productId);
  const steps = ["ordered", "preparing", "shipped", "delivered"];
  const current = steps.indexOf(item.status || "ordered");
  const history = item.history || [];
  return `<main class="wrap inner-page narrow" id="main"><a class="breadcrumb" href="orders.html">← View all orders</a><div class="page-heading"><div><span class="eyebrow">FOLLOW THE GOOD THINGS</span><h1>Your package, at a glance.</h1></div></div><section class="tracking-panel panel"><div class="tracking-heading"><div><span class="status-badge">${escape(statusLabel(item.status))}</span><h2>${item.status === "delivered" ? "Delivery complete" : item.status === "cancelled" ? "Order cancelled" : "Estimated arrival"}<br><em>${date(item.estimatedDeliveryTimeMs)}</em></h2><p>Delivery updates are entered manually by the store. ${o.sample ? "This is an original sample order." : "This is a demo order. No payment was collected."}</p>${item.trackingNote ? `<p class="tracking-note">${escape(item.trackingNote)}</p>` : ""}</div>${icon("truck")}</div><div class="tracking-product"><img src="${escape(p.image)}" alt="${escape(p.name)}"><div><h3>${escape(p.name)}</h3><p>Quantity: ${item.quantity}</p><button class="text-button" data-action="add" data-id="${p.id}" ${!products.some((x) => x.id === p.id) ? "disabled" : ""}>Add to bag again ${icon("plus")}</button></div></div>${
    item.status !== "cancelled"
      ? `<ol class="timeline">${steps
          .map((step, i) => {
            const event = [...history].reverse().find((h) => h.status === step);
            return `<li class="${i <= current ? "complete" : ""}" ${i === current ? 'aria-current="step"' : ""}><span>${icon(i <= current ? "check" : step === "shipped" ? "truck" : "box")}</span><strong>${statusLabel(step)}</strong><small>${event ? date(event.atMs) : i < current ? "Completed" : "Awaiting store update"}</small></li>`;
          })
          .join("")}</ol>`
      : `<p class="cancelled-notice">This item was marked as cancelled by the store.</p>`
  }${item.carrier || item.trackingNumber ? `<div class="tracking-carrier"><span>Carrier <strong>${escape(item.carrier || "Not specified")}</strong></span><span>Tracking number <strong>${escape(item.trackingNumber || "Not assigned")}</strong></span>${item.trackingNumber ? `<button class="text-button" data-action="copy" data-id="${escape(item.trackingNumber)}">Copy tracking number ${icon("copy")}</button>` : ""}</div>` : ""}<details class="tracking-history"><summary>Delivery update history (${history.length})</summary>${[
    ...history,
  ]
    .reverse()
    .map(
      (h) =>
        `<div><strong>${escape(statusLabel(h.status))}</strong><span>${new Date(h.atMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span><p>${escape(h.note || "Status updated by the store.")}</p></div>`,
    )
    .join(
      "",
    )}</details><div class="tracking-id"><span>Order ID <b>${escape(o.id)}</b></span><button class="icon-button" data-action="copy" data-id="${escape(o.id)}" aria-label="Copy order ID">${icon("copy")}</button></div></section><a class="text-link" href="index.html#catalog">Discover more everyday favorites ${icon("arrow")}</a></main>`;
}

function render() {
  $("#app").innerHTML =
    header() +
    ({ index: home, checkout, orders: ordersPage, tracking }[page] || home)() +
    footer();
  if (page === "index") {
    renderProducts();
    $("#sort").value = sort;
  }
  watchReveals();
}
// Observe only editorial sections; product filtering retains its own short entrance.
let revealObserver;
function watchReveals() {
  revealObserver?.disconnect();
  if (
    !("IntersectionObserver" in window) ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  document
    .querySelectorAll(".collections, .approach, .faq")
    .forEach((section) => {
      section.classList.add("scroll-reveal");
      revealObserver.observe(section);
    });
}
function openDetail(id) {
  const p = product(id);
  if (!p) return;
  const modal = $("#product-dialog");
  modal.innerHTML = `<button class="modal-close icon-button" data-action="close-modal" aria-label="Close product details">${icon("close")}</button><div class="detail-grid"><div class="detail-image"><img src="${escape(p.image)}" alt="${escape(p.name)}"></div><div class="detail-copy"><span class="eyebrow">${escape(categoryOf(p))}</span><h2>${escape(p.name)}</h2><div class="rating">${p.rating.count ? `★ ${p.rating.stars} <small>· ${p.rating.count.toLocaleString()} ratings</small>` : "New arrival · No ratings yet"}</div><strong class="detail-price">${money(p.priceCents)}</strong><p>${escape(p.description || `A little upgrade for your everyday. Explore this essential from our ${categoryOf(p).toLowerCase()} collection.`)}</p><label class="detail-quantity">Quantity <select id="detail-quantity">${Array.from({ length: 10 }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label><button class="button full" ${p.stock === 0 || !products.some((x) => x.id === p.id) ? "disabled" : ""} data-action="detail-add" data-id="${p.id}">Add to bag ${icon("bag")}</button><button class="button secondary full" data-action="save" data-id="${p.id}" aria-pressed="${saved.includes(id)}">${icon("heart")} ${saved.includes(id) ? "Saved to favorites" : "Save for later"}</button><p class="detail-delivery">${icon("truck")} Free standard delivery available</p></div></div>`;
  modal.showModal();
}

document.addEventListener("click", async (e) => {
  if (e.target.closest("#mobile-nav a")) {
    $("#mobile-nav").hidden = true;
    const toggle = $('[data-action="menu"]');
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  }
  const cat = e.target.closest("[data-category]");
  if (cat && page === "index") {
    category = cat.dataset.category;
    savedOnly = false;
    $(".saved-filter").classList.remove("active");
    $(".saved-filter").setAttribute("aria-pressed", "false");
    renderProducts();
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.action) {
    case "add":
      add(id);
      break;
    case "detail-add":
      add(id, Number($("#detail-quantity").value));
      $("#product-dialog").close();
      break;
    case "detail":
      openDetail(id);
      break;
    case "close-modal":
      $("#product-dialog").close();
      break;
    case "save":
      saved = saved.includes(id)
        ? saved.filter((x) => x !== id)
        : [...saved, id];
      save("saved", saved);
      const active = saved.includes(id);
      document
        .querySelectorAll(`[data-action="save"][data-id="${id}"]`)
        .forEach((el) => {
          el.classList.toggle("is-saved", active);
          el.setAttribute("aria-pressed", active);
          if (el.closest("dialog"))
            el.innerHTML = `${icon("heart")} ${active ? "Saved to favorites" : "Save for later"}`;
        });
      if (savedOnly && page === "index") renderProducts();
      toast(
        active ? "Saved for a little later." : "Removed from your saved items.",
      );
      break;
    case "saved-filter":
      savedOnly = !savedOnly;
      b.classList.toggle("active", savedOnly);
      b.setAttribute("aria-pressed", savedOnly);
      renderProducts();
      break;
    case "reset":
      query = "";
      category = "All essentials";
      savedOnly = false;
      $("#catalog-search").value = "";
      $(".saved-filter").classList.remove("active");
      $(".saved-filter").setAttribute("aria-pressed", "false");
      renderProducts();
      break;
    case "search": {
      const form = $(".header-search");
      form.hidden = !form.hidden;
      b.setAttribute("aria-expanded", !form.hidden);
      if (!form.hidden) $("#global-search").focus();
      break;
    }
    case "menu": {
      const nav = $("#mobile-nav");
      nav.hidden = !nav.hidden;
      b.setAttribute("aria-expanded", !nav.hidden);
      b.setAttribute(
        "aria-label",
        nav.hidden ? "Open navigation" : "Close navigation",
      );
      break;
    }
    case "remove":
      cart = cart.filter((c) => c.productId !== id);
      save("cart", cart);
      render();
      toast("Removed from your bag.");
      break;
    case "increment":
    case "decrement": {
      const c = cart.find((c) => c.productId === id);
      c.quantity = Math.max(
        1,
        Math.min(99, c.quantity + (b.dataset.action === "increment" ? 1 : -1)),
      );
      save("cart", cart);
      render();
      const next = document.querySelector(
        `[data-action="${b.dataset.action}"][data-id="${id}"]`,
      );
      if (next && !next.disabled) next.focus();
      break;
    }
    case "copy":
      try {
        await navigator.clipboard.writeText(id);
        toast("Copied to clipboard.");
      } catch {
        toast(
          "Copy unavailable. Your full order ID is shown on the tracking page.",
        );
      }
      break;
    case "place-order": {
      if (!cart.length) return;
      b.disabled = true;
      b.textContent = "Saving your order…";
      try {
        await request("/api/orders", {
          method: "POST",
          csrf: customerCsrf,
          body: {
            items: cart,
            expectedTotalCents: totals().total,
            requestId: checkoutRequestId,
          },
        });
        cart = [];
        save("cart", cart);
        location.href = "orders.html?placed=1";
      } catch (error) {
        b.disabled = false;
        b.innerHTML = `Place demo order ${icon("arrow")}`;
        toast(error.message);
        if (error.status === 409) {
          checkoutRequestId = crypto.randomUUID();
          await refreshStore();
        }
      }
      break;
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "catalog-search") {
    query = e.target.value;
    renderProducts();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "sort") {
    sort = e.target.value;
    renderProducts();
  }
  if (e.target.matches(".delivery-options input")) {
    const c = cart.find((c) => c.productId === e.target.dataset.id);
    c.deliveryOptionId = e.target.value;
    save("cart", cart);
    render();
    document
      .querySelector(
        `input[name="${e.target.name}"][value="${e.target.value}"]`,
      )
      ?.focus();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.matches(".header-search")) {
    e.preventDefault();
    const q = $("#global-search").value;
    if (page === "index") {
      query = q;
      $("#catalog-search").value = q;
      renderProducts();
      $("#catalog").scrollIntoView({ behavior: "smooth" });
      $(".header-search").hidden = true;
      $('[data-action="search"]').setAttribute("aria-expanded", "false");
    } else location.href = `index.html?q=${encodeURIComponent(q)}#catalog`;
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    $(".header-search") &&
    !$(".header-search").hidden
  ) {
    $(".header-search").hidden = true;
    const toggle = $('[data-action="search"]');
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }
});
$("#product-dialog").addEventListener("click", (e) => {
  if (e.target === $("#product-dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
window.addEventListener("storage", () => {
  cart = read("cart", cart).filter((c) =>
    products.some((p) => p.id === c.productId),
  );
  saved = read("saved", saved);
  render();
});

function statusLabel(status) {
  return (
    {
      ordered: "Order placed",
      preparing: "Preparing",
      shipped: "On the way",
      delivered: "Delivered",
      cancelled: "Cancelled",
    }[status] || "Order placed"
  );
}

async function loadStore() {
  const data = await request("/api/bootstrap");
  customerCsrf = data.csrf;
  products = data.products;
  orders = data.orders;
  delivery = data.deliveryOptions;
  return data;
}

async function refreshStore() {
  if (
    $("#product-dialog").open ||
    document.activeElement?.id === "catalog-search"
  )
    return;
  try {
    const previous = JSON.stringify({ products, orders });
    await loadStore();
    cart = cart.filter((c) => products.some((p) => p.id === c.productId));
    if (
      JSON.stringify({ products, orders }) !== previous &&
      !$("#product-dialog").open
    ) {
      const searchFocused = document.activeElement?.id === "catalog-search";
      if (!searchFocused) render();
    }
  } catch {
    /* Keep the last view while a temporary connection failure recovers. */
  }
}

async function start() {
  try {
    const data = await loadStore();
    const legacy = read("orders", []).filter((o) => o.local);
    if (legacy.length) {
      await request("/api/orders/import", {
        method: "POST",
        csrf: customerCsrf,
        body: { orders: legacy.slice(0, 100) },
      });
      await loadStore();
    }
    cart = read("cart", data.initialCart || []).filter(
      (c) =>
        products.some((p) => p.id === c.productId) &&
        Number.isInteger(c.quantity) &&
        c.quantity > 0 &&
        c.quantity <= 99,
    );
    saved = saved.filter((id) => products.some((p) => p.id === id));
    cart.forEach((c) => {
      if (!delivery.some((d) => d.id === c.deliveryOptionId))
        c.deliveryOptionId = "1";
    });
    render();
    if (location.hash)
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView(),
      );
    if (new URLSearchParams(location.search).has("placed"))
      toast("Your demo order is saved. Thank you for shopping Forma.");
    setInterval(refreshStore, 15000);
    window.addEventListener("focus", refreshStore);
  } catch (error) {
    $("#app").innerHTML =
      `<main id="main" class="wrap inner-page">${empty("A small pause.", "We couldn’t connect to the store. Start python server.py and refresh to try again.")}</main>`;
    console.error(error);
  }
}
start();
