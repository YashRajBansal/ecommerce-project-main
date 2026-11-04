import { request } from "./api.js";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const imageUrl = (value) =>
  String(value || "").startsWith("images/") ? "/" + value : value;
const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const date = (ms) =>
  new Date(ms).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
const statuses = {
  ordered: "Order placed",
  preparing: "Preparing",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const categories = [
  "Home & living",
  "Clothing",
  "Kitchen",
  "Active & outdoor",
  "Accessories",
];
const symbols = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M3 8l9 5v9M7 6l9 5"/>',
  truck:
    '<path d="M1 5h13v12H1zM14 9h5l4 5v3h-9"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  lock: '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>',
};
const icon = (name) =>
  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] || symbols.box}</svg>`;
let csrf = "",
  data = { products: [], orders: [], images: [], audit: [] },
  section = "overview",
  query = "",
  productFilter = "active",
  orderFilter = "all";
let editingId = null,
  archiveId = null;

function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}

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

function login(message = "") {
  csrf = "";
  data = { products: [], orders: [], images: [], audit: [] };
  $("#product-editor").close();
  $("#archive-dialog").close();
  $("#admin-app").innerHTML =
    `<main id="main" class="admin-login"><section class="login-story"><a class="wordmark" href="/index.html">forma<span>®</span></a><div><span class="eyebrow">THE OTHER SIDE OF EVERYDAY</span><h1>Good things.<br>In <em>your hands.</em></h1><p>A considered workspace for your collection, your orders, and every little detail in between.</p></div><span class="login-story-bottom">FORMA / STORE OPERATIONS</span></section><section class="login-form-side"><div class="login-card"><span class="lock-mark">${icon("lock")}</span><span class="eyebrow">YOUR STORE WORKSPACE</span><h2>Welcome back.</h2><p>Sign in to take care of the everyday.</p><form id="login-form"><label>Username<input name="username" autocomplete="username" value="admin" required maxlength="80"></label><label>Password<span class="password-input"><input id="login-password" aria-label="Password" name="password" type="password" autocomplete="current-password" required maxlength="128"><button type="button" data-action="toggle-password" aria-controls="login-password" aria-pressed="false">Show</button></span></label><p class="form-error" id="login-error" role="alert">${esc(message)}</p><button class="button full">Sign in securely ${icon("arrow")}</button></form><p class="login-help">First time here? Your initial sign-in details are in the private <strong>.store/admin-access.txt</strong> file on the server. Change your password in Security after signing in.</p><a class="text-link" href="/index.html">Back to the storefront ${icon("arrow")}</a></div></section></main>`;
}

function shell() {
  $("#admin-app").innerHTML =
    `<div class="admin-layout"><aside class="admin-sidebar"><a class="wordmark" href="/index.html">forma<span>®</span></a><span class="sidebar-label">STORE WORKSPACE</span><nav aria-label="Admin navigation">${[
      ["overview", "grid", "Overview"],
      ["products", "box", "Collection"],
      ["orders", "truck", "Orders & delivery"],
      ["security", "lock", "Security"],
    ]
      .map(
        ([id, symbol, label]) =>
          `<button data-section="${id}" ${section === id ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span>${id === "products" ? `<b>${data.products.filter((p) => p.active).length}</b>` : ""}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><span class="admin-online"><i></i> Signed in as admin</span><a href="/index.html" target="_blank" rel="noopener">View storefront ↗</a><button class="text-button" data-action="logout">Sign out</button></div></aside><div class="admin-main"><header class="admin-topbar"><span>Workspace <span>/</span> ${section === "products" ? "Collection" : section === "orders" ? "Orders & delivery" : section === "security" ? "Security" : "Overview"}</span><div><span class="admin-tag">STORE ADMIN</span><button class="icon-button" data-action="refresh" aria-label="Refresh store data" title="Refresh store data">${icon("refresh")}</button></div></header><main id="main" class="admin-content" tabindex="-1"></main></div></div>`;
  renderContent();
}

function heading(title, subtitle, action = "") {
  return `<div class="admin-heading"><div><span class="eyebrow">THE DETAILS MAKE THE DIFFERENCE</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function overview() {
  const items = data.orders.flatMap((o) => o.products);
  const active = data.products.filter((p) => p.active).length;
  const pending = items.filter(
    (i) => !["delivered", "cancelled"].includes(i.status),
  ).length;
  const low = data.products.filter(
    (p) => p.active && p.stock !== null && p.stock <= 5,
  ).length;
  return (
    heading(
      "A good day to make things better.",
      "Your store at a glance. Every change you make is saved to the store.",
    ) +
    `<div class="admin-stats">${[
      ["Active products", active, "In your live collection", "box"],
      [
        "Orders",
        data.orders.length,
        "Including original sample orders",
        "grid",
      ],
      ["Awaiting delivery", pending, "Items to prepare or deliver", "truck"],
      ["Low stock", low, "Products with 5 or fewer left", "box"],
    ]
      .map(
        ([label, n, note, symbol]) =>
          `<div class="panel stat-card"><span>${label}${icon(symbol)}</span><strong>${n}</strong><small>${note}</small></div>`,
      )
      .join(
        "",
      )}</div><div class="admin-overview-grid"><section class="panel workspace-card"><div class="workspace-title"><h2>Your collection, considered.</h2><button class="text-button" data-section="products">Manage collection ${icon("arrow")}</button></div><p>Keep prices, details, and availability up to date. Archive products without losing their order history.</p><div class="overview-products">${data.products
      .filter((p) => p.active)
      .slice(0, 4)
      .map(
        (p) =>
          `<button data-action="edit-product" data-id="${p.id}" aria-label="Edit ${esc(p.name)}"><img src="${esc(imageUrl(p.image))}" alt="${esc(p.name)}"><span>${esc(p.name)}</span><strong>${money(p.priceCents)}</strong></button>`,
      )
      .join(
        "",
      )}</div><button class="button small" data-action="new-product">${icon("plus")} Add a good thing</button></section><section class="panel workspace-card"><div class="workspace-title"><h2>Recent activity</h2></div><div class="audit-list">${
      data.audit.length
        ? data.audit
            .slice(0, 8)
            .map(
              (a) =>
                `<div><span class="audit-dot"></span><div><strong>${esc(a.action.replaceAll(".", " · ").replaceAll("_", " "))}</strong><small>${date(a.at_ms)} IST</small></div></div>`,
            )
            .join("")
        : "<p>Store updates and sign-ins will appear here.</p>"
    }</div></section></div><div class="admin-info">${icon("lock")} This workspace is password protected. Checkout remains a demo; delivery statuses are set manually.</div>`
  );
}

function productRows() {
  const list = data.products.filter(
    (p) =>
      (productFilter === "all" ||
        (productFilter === "active" ? p.active : !p.active)) &&
      `${p.name} ${p.keywords.join(" ")} ${categoryOf(p)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  $("#admin-product-count").textContent =
    `${list.length} ${list.length === 1 ? "product" : "products"}`;
  $("#product-rows").innerHTML = list.length
    ? list
        .map(
          (p) =>
            `<tr><td><div class="table-product"><img src="${esc(imageUrl(p.image))}" alt=""><div><strong>${esc(p.name)}</strong><small>${esc(categoryOf(p))}</small></div></div></td><td>${money(p.priceCents)}</td><td>${p.stock === null ? "Not limited" : p.stock}</td><td><span class="admin-status ${!p.active ? "muted" : p.stock === 0 ? "warning" : ""}">${!p.active ? "Archived" : p.stock === 0 ? "Sold out" : "Active"}</span></td><td><div class="row-actions"><button class="text-button" data-action="edit-product" data-id="${p.id}">Edit</button><button class="text-button ${p.active ? "danger" : ""}" data-action="${p.active ? "archive-product" : "restore-product"}" data-id="${p.id}">${p.active ? "Archive" : "Restore"}</button></div></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="table-empty">No products match. Try a different search or filter.</td></tr>';
}

function collection() {
  return (
    heading(
      "Good things, thoughtfully managed.",
      "Add, edit, price, and organize your everyday collection.",
      `<button class="button" data-action="new-product">${icon("plus")} Add product</button>`,
    ) +
    `<section class="panel product-table-panel"><div class="admin-toolbar"><label class="admin-search">${icon("search")}<input id="admin-search" type="search" value="${esc(query)}" placeholder="Search products or collections" aria-label="Search collection"></label><div class="admin-filter-group" role="group" aria-label="Product availability">${["active", "archived", "all"].map((f) => `<button data-product-filter="${f}" aria-pressed="${productFilter === f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}</div><span id="admin-product-count"></span></div><div class="table-scroll" tabindex="0" aria-label="Product collection table"><table><thead><tr><th scope="col">PRODUCT</th><th scope="col">PRICE</th><th scope="col">STOCK</th><th scope="col">STATUS</th><th scope="col">ACTIONS</th></tr></thead><tbody id="product-rows"></tbody></table></div></section><p class="admin-footnote">Archiving removes a product from the shop. Past orders keep a snapshot of the product and original price.</p>`
  );
}

function orderCards() {
  const list = data.orders.filter(
    (o) =>
      (orderFilter === "all" ||
        o.products.some((i) => i.status === orderFilter)) &&
      `${o.id} ${o.products.map((i) => i.productSnapshot?.name || "").join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  $("#admin-order-count").textContent =
    `${list.length} ${list.length === 1 ? "order" : "orders"}`;
  $("#admin-order-list").innerHTML = list.length
    ? list
        .map(
          (o) =>
            `<article class="panel admin-order"><div class="admin-order-header"><div><span class="eyebrow">${o.sample ? "SAMPLE ORDER" : o.imported ? "IMPORTED DEMO ORDER" : "DEMO ORDER"}</span><h2>${esc(o.id)}</h2><span>${date(o.orderTimeMs)} IST</span></div><strong>${money(o.totalCostCents)}</strong></div>${o.products
              .map((item) => {
                const p =
                  item.productSnapshot ||
                  data.products.find((p) => p.id === item.productId);
                const arrival = new Date(
                  item.estimatedDeliveryTimeMs,
                ).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                return `<div class="admin-order-item"><img src="${esc(imageUrl(p?.image))}" alt=""><div class="admin-order-item-content"><div class="admin-order-item-heading"><div><h3>${esc(p?.name || "Archived product")}</h3><p>Quantity ${item.quantity} · Estimated arrival ${arrival}</p></div><span class="admin-status ${item.status === "cancelled" ? "warning" : ""}">${esc(statuses[item.status] || "Order placed")}</span></div><details class="tracking-editor"><summary>Update delivery tracking <span>+</span></summary><form class="tracking-form" data-order="${esc(o.id)}" data-product="${item.productId}" data-version="${item.version || 1}"><div class="form-grid"><label>Delivery status<select name="status">${Object.entries(
                  statuses,
                )
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`,
                  )
                  .join(
                    "",
                  )}</select></label><label>Estimated arrival<input type="date" name="arrival" value="${arrival}" required min="2000-01-01" max="2100-12-31"></label><label>Carrier<input name="carrier" value="${esc(item.carrier)}" maxlength="80" placeholder="e.g. DHL"></label><label>Tracking number<input name="trackingNumber" value="${esc(item.trackingNumber)}" maxlength="120" placeholder="Carrier reference"></label><label class="span-two">Customer-visible delivery note<textarea name="trackingNote" maxlength="500" rows="2" placeholder="Let the customer know what’s happening">${esc(item.trackingNote)}</textarea></label></div><p class="form-error" role="alert"></p><button class="button small">Save delivery update ${icon("arrow")}</button><span class="tracking-save-hint">Visible on the customer’s tracking page.</span></form>${
                  item.history?.length
                    ? `<div class="admin-history"><strong>Recent updates</strong>${item.history
                        .slice(-3)
                        .reverse()
                        .map(
                          (h) =>
                            `<p>${esc(statuses[h.status])} · ${date(h.atMs)} IST<br><span>${esc(h.note)}</span></p>`,
                        )
                        .join("")}</div>`
                    : ""
                }</details></div></div>`;
              })
              .join("")}</article>`,
        )
        .join("")
    : '<div class="panel empty-state"><h2>No orders found.</h2><p>Try another search or status filter.</p></div>';
}

function orders() {
  return (
    heading(
      "Every delivery, in your hands.",
      "Update order progress, arrival dates, and tracking details manually.",
    ) +
    `<div class="admin-info">${icon("truck")} Status changes appear in the storefront automatically within 15 seconds, or immediately after refresh.</div><div class="admin-toolbar orders-toolbar"><label class="admin-search">${icon("search")}<input id="admin-search" type="search" value="${esc(query)}" placeholder="Search order ID or product name" aria-label="Search orders"></label><label class="order-status-filter">Status<select id="order-status-filter"><option value="all">All statuses</option>${Object.entries(
      statuses,
    )
      .map(
        ([id, label]) =>
          `<option value="${id}" ${orderFilter === id ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><span id="admin-order-count"></span></div><div id="admin-order-list"></div>`
  );
}

function security() {
  return (
    heading(
      "Keep your store in good hands.",
      "Manage the password for your administrator account.",
    ) +
    `<section class="panel security-card"><div class="security-icon">${icon("lock")}</div><h2>Change admin password</h2><p>Use a unique passphrase with at least 15 characters. Changing it signs out every admin session.</p><form id="password-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" required minlength="15" maxlength="128"><small>15–128 characters. A memorable phrase works well.</small></label><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="15" maxlength="128"></label><p class="form-error" role="alert"></p><button class="button">Update password & sign out ${icon("arrow")}</button></form></section><div class="admin-info">${icon("lock")} Admin sessions expire after 8 hours. Your password is hashed on the server; it is never saved in browser storage.</div>`
  );
}

function renderContent() {
  $("#main").innerHTML = { overview, products: collection, orders, security }[
    section
  ]();
  if (section === "products") productRows();
  if (section === "orders") orderCards();
}

async function refresh(showToast = false) {
  data = await request("/api/admin/data");
  if (showToast) toast("Store data refreshed.");
}

function openEditor(id = null) {
  editingId = id;
  const p = data.products.find((p) => p.id === id);
  const modal = $("#product-editor");
  modal.innerHTML = `<div class="editor-header"><div><span class="eyebrow">YOUR CONSIDERED COLLECTION</span><h2 id="editor-title">${p ? "A little refinement." : "Make room for a good thing."}</h2></div><button class="icon-button" data-action="close-editor" aria-label="Close product editor">${icon("close")}</button></div><form id="product-form"><div class="editor-layout"><div class="image-editor"><img id="editor-image" src="${esc(imageUrl(p?.image || data.images[0]))}" alt="Product image preview"><p>Use an image from the project or an HTTPS image URL.</p></div><div class="form-grid"><label class="span-two">Product name<input name="name" value="${esc(p?.name)}" required maxlength="180"></label><label>Price (USD)<input name="price" type="number" min="0.01" max="1000000" step="0.01" value="${p ? (p.priceCents / 100).toFixed(2) : ""}" required inputmode="decimal"></label><label>Collection<select name="category">${categories.map((c) => `<option ${c === (p ? categoryOf(p) : categories[0]) ? "selected" : ""}>${c}</option>`).join("")}</select></label><label>Stock quantity<input name="stock" type="number" min="0" max="1000000" step="1" value="${p?.stock ?? ""}" placeholder="Blank = not limited"><small>0 marks the product sold out.</small></label><label>Store visibility<select name="active"><option value="true" ${!p || p.active ? "selected" : ""}>Active in collection</option><option value="false" ${p && !p.active ? "selected" : ""}>Archived / hidden</option></select></label><label class="span-two">Product image<input id="image-path" name="image" list="product-image-options" value="${esc(p?.image || data.images[0])}" required maxlength="1000"><datalist id="product-image-options">${data.images.map((image) => `<option value="${esc(image)}">`).join("")}</datalist></label><label class="span-two">Description<textarea name="description" rows="3" maxlength="2000" placeholder="What makes this a good everyday find?">${esc(p?.description)}</textarea></label><label class="span-two">Search keywords<input name="keywords" value="${esc(p?.keywords.join(", "))}" maxlength="1200" placeholder="home, ceramic, everyday"><small>Separate keywords with commas. Up to 25.</small></label></div></div><div class="editor-footer"><p class="form-error" role="alert"></p><div><button type="button" class="button secondary" data-action="close-editor">Cancel</button><button class="button">${p ? "Save changes" : "Add to collection"} ${icon("arrow")}</button></div></div></form>`;
  modal.showModal();
}

function formError(form, error) {
  if (error.status === 401) {
    login("Your session expired. Please sign in again.");
    return;
  }
  $(".form-error", form).textContent = error.message;
}

document.addEventListener("click", async (e) => {
  const nav = e.target.closest("[data-section]");
  if (nav) {
    section = nav.dataset.section;
    query = "";
    shell();
    $("#main").focus();
    return;
  }
  const filter = e.target.closest("[data-product-filter]");
  if (filter) {
    productFilter = filter.dataset.productFilter;
    document
      .querySelectorAll("[data-product-filter]")
      .forEach((b) => b.setAttribute("aria-pressed", b === filter));
    productRows();
    return;
  }
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  try {
    switch (button.dataset.action) {
      case "toggle-password": {
        const input = $("#login-password");
        input.type = input.type === "password" ? "text" : "password";
        button.textContent = input.type === "password" ? "Show" : "Hide";
        button.setAttribute("aria-pressed", input.type === "text");
        break;
      }
      case "logout":
        button.disabled = true;
        await request("/api/admin/logout", { method: "POST", csrf, body: {} });
        login("You’ve signed out.");
        break;
      case "refresh":
        button.disabled = true;
        await refresh(true);
        shell();
        break;
      case "new-product":
        openEditor();
        break;
      case "edit-product":
        openEditor(id);
        break;
      case "close-editor":
        $("#product-editor").close();
        break;
      case "archive-product": {
        archiveId = id;
        const p = data.products.find((p) => p.id === id);
        $("#archive-dialog").innerHTML =
          `<div class="archive-content"><span class="eyebrow">A LITTLE ROOM IN THE COLLECTION</span><h2 id="archive-title">Archive this product?</h2><p><strong>${esc(p.name)}</strong> will be removed from the shop. Past orders will keep their original details, and you can restore the product anytime.</p><div><button class="button secondary" data-action="cancel-archive">Keep product</button><button class="button" data-action="confirm-archive">Archive product</button></div></div>`;
        $("#archive-dialog").showModal();
        break;
      }
      case "cancel-archive":
        $("#archive-dialog").close();
        break;
      case "confirm-archive": {
        button.disabled = true;
        const p = data.products.find((p) => p.id === archiveId);
        await request(`/api/admin/products/${p.id}`, {
          method: "DELETE",
          csrf,
          body: { version: p.version },
        });
        $("#archive-dialog").close();
        await refresh();
        shell();
        toast("Product archived. Order history preserved.");
        break;
      }
      case "restore-product": {
        button.disabled = true;
        const p = data.products.find((p) => p.id === id);
        await request(`/api/admin/products/${id}`, {
          method: "PATCH",
          csrf,
          body: { ...p, category: categoryOf(p), active: true },
        });
        await refresh();
        shell();
        toast("Product restored to the collection.");
        break;
      }
    }
  } catch (error) {
    if (error.status === 401) login("Please sign in again.");
    else toast(error.message);
    button.disabled = false;
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "admin-search") {
    query = e.target.value;
    if (section === "products") productRows();
    else orderCards();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "order-status-filter") {
    orderFilter = e.target.value;
    orderCards();
  }
  if (e.target.id === "image-path") {
    const value = e.target.value;
    if (value.startsWith("images/") || /^https:\/\//.test(value))
      $("#editor-image").src = value.startsWith("images/")
        ? "/" + value
        : value;
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (
    !["login-form", "product-form", "password-form"].includes(form.id) &&
    !form.matches(".tracking-form")
  )
    return;
  e.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const submit = $("button:not([type=button])", form);
  submit.disabled = true;
  $(".form-error", form).textContent = "";
  try {
    if (form.id === "login-form") {
      const session = await request("/api/admin/login", {
        method: "POST",
        body: values,
      });
      csrf = session.csrf;
      await refresh();
      shell();
      return;
    }
    if (form.id === "password-form") {
      if (values.newPassword !== values.confirmPassword)
        throw new Error("The new passwords don’t match.");
      await request("/api/admin/password", {
        method: "POST",
        csrf,
        body: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      });
      login("Password updated. Sign in with your new password.");
      return;
    }
    if (form.id === "product-form") {
      const existing = data.products.find((p) => p.id === editingId);
      const price = Number(values.price);
      if (!Number.isFinite(price) || price <= 0)
        throw new Error("Enter a valid price greater than zero.");
      const body = {
        name: values.name,
        priceCents: Math.round(price * 100),
        category: values.category,
        image: values.image,
        description: values.description,
        keywords: values.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        stock: values.stock === "" ? null : Number(values.stock),
        active: values.active === "true",
        ...(existing ? { version: existing.version } : {}),
      };
      await request(`/api/admin/products${editingId ? "/" + editingId : ""}`, {
        method: editingId ? "PATCH" : "POST",
        csrf,
        body,
      });
      $("#product-editor").close();
      await refresh();
      shell();
      toast(
        existing
          ? "Product updated. Good things, refined."
          : "A good thing added to your collection.",
      );
      return;
    }
    if (form.matches(".tracking-form")) {
      const arrival = Date.parse(values.arrival + "T12:00:00+05:30");
      if (!Number.isFinite(arrival))
        throw new Error("Choose a valid arrival date.");
      await request(
        `/api/admin/orders/${form.dataset.order}/items/${form.dataset.product}`,
        {
          method: "PATCH",
          csrf,
          body: {
            status: values.status,
            estimatedDeliveryTimeMs: arrival,
            carrier: values.carrier,
            trackingNumber: values.trackingNumber,
            trackingNote: values.trackingNote,
            version: Number(form.dataset.version),
          },
        },
      );
      await refresh();
      orderCards();
      toast("Delivery tracking updated for the customer.");
    }
  } catch (error) {
    formError(form, error);
  } finally {
    submit.disabled = false;
  }
});

async function start() {
  try {
    const session = await request("/api/admin/session");
    csrf = session.csrf;
    await refresh();
    shell();
  } catch (error) {
    login(error.status === 401 ? "" : error.message);
  }
}
start();
