const PRODUCTS_STORAGE_KEY = "tcg-store-products-v1";
const ADMIN_SESSION_KEY = "tcg-store-admin-session";
// Static prototype only. Replace this with server-side auth before launch.
const ADMIN_PASSWORD = "admin";
const CURRENCY = "USD";

const defaultProducts = [
  {
    id: "product-1",
    name: "Product 1",
    description: "A placeholder trading card game product ready for your final copy.",
    price: 9.99,
    stock: 0,
    image: "assets/product-placeholder.png",
  },
];

const state = {
  products: loadProducts(),
  draftProducts: [],
  isAdmin: sessionStorage.getItem(ADMIN_SESSION_KEY) === "true",
};

const productGrid = document.querySelector("#productGrid");
const adminToggle = document.querySelector("#adminToggle");
const adminPanel = document.querySelector("#adminPanel");
const panelOverlay = document.querySelector("#panelOverlay");
const closePanel = document.querySelector("#closePanel");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const editorForm = document.querySelector("#editorForm");
const editorList = document.querySelector("#editorList");
const addProductButton = document.querySelector("#addProduct");
const resetProductsButton = document.querySelector("#resetProducts");
const logoutButton = document.querySelector("#logoutAdmin");
const toast = document.querySelector("#toast");

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
});

let toastTimeout;

renderStore();
renderAdmin();

adminToggle.addEventListener("click", openPanel);
closePanel.addEventListener("click", closeAdminPanel);
panelOverlay.addEventListener("click", closeAdminPanel);

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = new FormData(loginForm).get("adminPassword");

  if (password !== ADMIN_PASSWORD) {
    loginError.textContent = "Incorrect password.";
    return;
  }

  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  state.isAdmin = true;
  loginForm.reset();
  loginError.textContent = "";
  resetDraftProducts();
  renderAdmin();
  showToast("Signed in.");
});

editorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextProducts = readDraftProductsFromForm();

  if (!nextProducts.length) {
    showToast("Add at least one item.");
    return;
  }

  state.products = nextProducts;
  saveProducts(state.products);
  resetDraftProducts();
  renderStore();
  renderAdmin();
  showToast("Changes saved.");
});

addProductButton.addEventListener("click", () => {
  syncDraftProductsFromForm();
  state.draftProducts.push({
    id: createProductId(),
    name: `Product ${state.draftProducts.length + 1}`,
    description: "A placeholder trading card game product.",
    price: 0,
    stock: 0,
    image: "assets/product-placeholder.png",
  });
  renderAdmin();
});

resetProductsButton.addEventListener("click", () => {
  state.products = cloneProducts(defaultProducts);
  saveProducts(state.products);
  resetDraftProducts();
  renderStore();
  renderAdmin();
  showToast("Products reset.");
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  state.isAdmin = false;
  renderAdmin();
  showToast("Signed out.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminPanel.classList.contains("is-open")) {
    closeAdminPanel();
  }
});

function renderStore() {
  productGrid.replaceChildren();

  state.products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-card";

    const imageWrap = document.createElement("div");
    imageWrap.className = "product-image-wrap";

    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.image || "assets/product-placeholder.png";
    image.alt = product.name;
    image.loading = "lazy";
    imageWrap.append(image);

    const content = document.createElement("div");
    content.className = "product-content";

    const title = document.createElement("h3");
    title.textContent = product.name;

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = product.description;

    const meta = document.createElement("div");
    meta.className = "product-meta";

    const price = document.createElement("span");
    price.className = "price";
    price.textContent = priceFormatter.format(product.price);

    const stock = document.createElement("span");
    stock.className = product.stock > 0 ? "stock-pill" : "stock-pill is-empty";
    stock.textContent = product.stock > 0 ? `${product.stock} in stock` : "Out of stock";

    meta.append(price, stock);

    const buyButton = document.createElement("button");
    buyButton.className = "buy-button";
    buyButton.type = "button";
    buyButton.disabled = product.stock <= 0;
    buyButton.textContent = product.stock > 0 ? "Buy now" : "Unavailable";
    buyButton.addEventListener("click", () => recordPurchase(product.id));

    content.append(title, description, meta, buyButton);
    card.append(imageWrap, content);
    productGrid.append(card);
  });
}

function renderAdmin() {
  loginForm.hidden = state.isAdmin;
  editorForm.hidden = !state.isAdmin;

  if (!state.isAdmin) {
    return;
  }

  if (!state.draftProducts.length) {
    resetDraftProducts();
  }

  editorList.replaceChildren();

  state.draftProducts.forEach((product, index) => {
    const row = document.createElement("section");
    row.className = "editor-product";
    row.dataset.productId = product.id;

    const rowTitle = document.createElement("div");
    rowTitle.className = "editor-product-title";

    const title = document.createElement("strong");
    title.textContent = product.name || `Product ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.disabled = state.draftProducts.length === 1;
    removeButton.addEventListener("click", () => {
      syncDraftProductsFromForm();
      state.draftProducts = state.draftProducts.filter((item) => item.id !== product.id);
      renderAdmin();
    });

    rowTitle.append(title, removeButton);

    const nameField = createField("Name", "text", "name", product.name, true);
    const descriptionField = createField("Description", "text", "description", product.description, true);
    const imageField = createField("Image URL", "text", "image", product.image, true);

    const fieldRow = document.createElement("div");
    fieldRow.className = "field-row";
    fieldRow.append(
      createField("Price", "number", "price", product.price, true, "0", "0.01"),
      createField("Stock", "number", "stock", product.stock, true, "0", "1"),
    );

    row.append(rowTitle, nameField, descriptionField, imageField, fieldRow);
    editorList.append(row);
  });
}

function createField(labelText, type, name, value, required, min, step) {
  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = value ?? "";
  input.required = required;

  if (min !== undefined) {
    input.min = min;
  }

  if (step !== undefined) {
    input.step = step;
  }

  label.append(input);
  return label;
}

function readDraftProductsFromForm() {
  return Array.from(editorList.querySelectorAll(".editor-product")).map((row, index) => {
    const getValue = (name) => row.querySelector(`[name="${name}"]`).value.trim();
    const price = Number.parseFloat(getValue("price"));
    const stock = Number.parseInt(getValue("stock"), 10);

    return normalizeProduct({
      id: row.dataset.productId || createProductId(),
      name: getValue("name") || `Product ${index + 1}`,
      description: getValue("description") || "Trading card game product.",
      image: getValue("image") || "assets/product-placeholder.png",
      price: Number.isFinite(price) ? price : 0,
      stock: Number.isFinite(stock) ? stock : 0,
    }, index);
  });
}

function syncDraftProductsFromForm() {
  const rows = editorList.querySelectorAll(".editor-product");

  if (rows.length) {
    state.draftProducts = readDraftProductsFromForm();
  }
}

function recordPurchase(productId) {
  const product = state.products.find((item) => item.id === productId);

  if (!product || product.stock <= 0) {
    showToast("This item is out of stock.");
    return;
  }

  product.stock -= 1;
  saveProducts(state.products);
  resetDraftProducts();
  renderStore();

  if (state.isAdmin) {
    renderAdmin();
  }

  showToast(`Purchase recorded for ${product.name}.`);
}

function openPanel() {
  adminPanel.classList.add("is-open");
  adminPanel.setAttribute("aria-hidden", "false");
  adminToggle.setAttribute("aria-expanded", "true");
  panelOverlay.hidden = false;

  if (state.isAdmin) {
    resetDraftProducts();
    renderAdmin();
  }
}

function closeAdminPanel() {
  adminPanel.classList.remove("is-open");
  adminPanel.setAttribute("aria-hidden", "true");
  adminToggle.setAttribute("aria-expanded", "false");
  panelOverlay.hidden = true;
}

function loadProducts() {
  const savedProducts = localStorage.getItem(PRODUCTS_STORAGE_KEY);

  if (!savedProducts) {
    return cloneProducts(defaultProducts);
  }

  try {
    const parsed = JSON.parse(savedProducts);

    if (!Array.isArray(parsed) || !parsed.length) {
      return cloneProducts(defaultProducts);
    }

    return parsed.map(normalizeProduct);
  } catch {
    return cloneProducts(defaultProducts);
  }
}

function saveProducts(products) {
  localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products.map(normalizeProduct)));
}

function normalizeProduct(product, index = 0) {
  const price = Number(product.price);
  const stock = Number(product.stock);

  return {
    id: product.id || createProductId(),
    name: String(product.name || `Product ${index + 1}`).trim(),
    description: String(product.description || "Trading card game product.").trim(),
    price: Number.isFinite(price) && price >= 0 ? Number(price.toFixed(2)) : 0,
    stock: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
    image: String(product.image || "assets/product-placeholder.png").trim(),
  };
}

function resetDraftProducts() {
  state.draftProducts = cloneProducts(state.products);
}

function cloneProducts(products) {
  return products.map((product, index) => normalizeProduct(product, index));
}

function createProductId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `product-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}
