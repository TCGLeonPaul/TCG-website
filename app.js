const CURRENCY = "GBP";
const NORMAL_SALE_TYPE = "standard";
const PRODUCT_IMAGE_FALLBACK = "assets/product-placeholder.png";
const BASKET_QUERY_FAILED = "basket-query-failed";

const SUPABASE_PROJECT_URL = "https://dwkvwzyarrkfhzsqkeof.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1VUFWbvJj9n7lW6uFP8vMw_cYbyLGWD";

const isSupabaseConfigured = Boolean(SUPABASE_PROJECT_URL && SUPABASE_PUBLISHABLE_KEY);

const supabaseClient = createSupabaseClient();

const state = {
  products: [],
  catalogueStatus: "loading",
  catalogueError: "",
  basket: {
    id: null,
    items: [],
    status: "signed-out",
    message: "",
    messageIsError: false,
    isBusy: false,
  },
  session: null,
  user: null,
  authMode: "sign-in",
  authReady: false,
};

const productGrid = document.querySelector("#productGrid");
const accountToggle = document.querySelector("#accountToggle");
const basketToggle = document.querySelector("#basketToggle");
const basketCount = document.querySelector("#basketCount");
const accountPanel = document.querySelector("#accountPanel");
const basketPanel = document.querySelector("#basketPanel");
const panelOverlay = document.querySelector("#panelOverlay");
const closePanel = document.querySelector("#closePanel");
const closeBasketPanel = document.querySelector("#closeBasketPanel");
const signedOutView = document.querySelector("#signedOutView");
const signedInView = document.querySelector("#signedInView");
const authTabs = document.querySelector("#authTabs");
const showSignInButton = document.querySelector("#showSignIn");
const showSignUpButton = document.querySelector("#showSignUp");
const signInForm = document.querySelector("#signInForm");
const signUpForm = document.querySelector("#signUpForm");
const signOutButton = document.querySelector("#signOutButton");
const authError = document.querySelector("#authError");
const authMessage = document.querySelector("#authMessage");
const accountEmail = document.querySelector("#accountEmail");
const accountEmailDetail = document.querySelector("#accountEmailDetail");
const basketMessage = document.querySelector("#basketMessage");
const basketItems = document.querySelector("#basketItems");
const basketSummary = document.querySelector("#basketSummary");
const basketTotal = document.querySelector("#basketTotal");
const toast = document.querySelector("#toast");

const priceFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: CURRENCY,
});

let toastTimeout;

renderStore();
renderBasket();
initializeCatalogue();
renderAccount();
initializeAuth();

accountToggle.addEventListener("click", openPanel);
basketToggle.addEventListener("click", openBasketPanel);
closePanel.addEventListener("click", closeAccountPanel);
closeBasketPanel.addEventListener("click", closeBasketDrawer);
panelOverlay.addEventListener("click", closeOpenPanels);
showSignInButton.addEventListener("click", () => setAuthMode("sign-in"));
showSignUpButton.addEventListener("click", () => setAuthMode("sign-up"));
authTabs.addEventListener("keydown", handleAuthTabsKeydown);
signInForm.addEventListener("submit", handleSignIn);
signUpForm.addEventListener("submit", handleSignUp);
signOutButton.addEventListener("click", handleSignOut);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isAnyPanelOpen()) {
    closeOpenPanels();
  }
});

function createSupabaseClient() {
  if (!isSupabaseConfigured || !window.supabase) {
    return null;
  }

  return window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

async function initializeAuth() {
  if (!supabaseClient) {
    state.authReady = true;
    renderAccount();
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    setAuthError(error.message);
  }

  setSession(data?.session ?? null);
  state.authReady = true;
  renderAccount();
  renderStore();
  await loadBasket();

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    setSession(session);

    if (event === "SIGNED_IN") {
      showToast("Signed in.");
      renderStore();
      await loadBasket();
    }

    if (event === "SIGNED_OUT") {
      showToast("Signed out.");
      resetBasket("signed-out", "Sign in to view your saved basket.");
      renderStore();
    }

    renderAccount();
  });
}

async function handleSignIn(event) {
  event.preventDefault();
  clearAuthMessages();

  if (!requireSupabaseConfig()) {
    return;
  }

  const formData = new FormData(signInForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  setAuthBusy(true);

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  setAuthBusy(false);

  if (error) {
    setAuthError(error.message);
    return;
  }

  signInForm.reset();
}

async function handleSignUp(event) {
  event.preventDefault();
  clearAuthMessages();

  if (!requireSupabaseConfig()) {
    return;
  }

  const formData = new FormData(signUpForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  setAuthBusy(true);

  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  setAuthBusy(false);

  if (error) {
    setAuthError(error.message);
    return;
  }

  signUpForm.reset();
  setAuthMessage("Account created. Check your email if confirmation is enabled.");
}

async function handleSignOut() {
  clearAuthMessages();

  if (!requireSupabaseConfig()) {
    return;
  }

  setAuthBusy(true);

  const { error } = await supabaseClient.auth.signOut({ scope: "local" });

  setAuthBusy(false);

  if (error) {
    setAuthError(error.message);
    return;
  }

  setSession(null);
  resetBasket("signed-out", "Sign in to view your saved basket.");
  renderStore();
  renderAccount();
}

async function initializeCatalogue() {
  if (!supabaseClient) {
    state.catalogueStatus = "error";
    state.catalogueError = "The product catalogue is not connected yet.";
    state.products = [];
    renderStore();
    return;
  }

  state.catalogueStatus = "loading";
  state.catalogueError = "";
  renderStore();

  const { data, error } = await supabaseClient
    .from("restock_waves")
    .select(
      `
        id,
        name,
        sale_type,
        status,
        price_pence,
        remaining_stock_quantity,
        per_customer_limit,
        products!inner (
          name,
          description,
          product_condition,
          image_url,
          is_active
        )
      `,
    )
    .eq("status", "active")
    .eq("sale_type", NORMAL_SALE_TYPE)
    .eq("products.is_active", true)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  if (error) {
    state.catalogueStatus = "error";
    state.catalogueError = "We could not load the catalogue right now. Please refresh and try again.";
    state.products = [];
    renderStore();
    return;
  }

  state.products = (data || []).map(normalizeCatalogueWave);
  state.catalogueStatus = "ready";
  renderStore();
}

function renderStore() {
  productGrid.replaceChildren();

  if (state.catalogueStatus === "loading") {
    productGrid.append(createCatalogueState("Loading products", "Checking the latest active restocks..."));
    return;
  }

  if (state.catalogueStatus === "error") {
    productGrid.append(createCatalogueState("Catalogue unavailable", state.catalogueError, "is-error"));
    return;
  }

  if (!state.products.length) {
    productGrid.append(createCatalogueState("No active restocks", "There are no active standard-sale restock waves to show yet."));
    return;
  }

  state.products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-card";

    const imageWrap = document.createElement("div");
    imageWrap.className = "product-image-wrap";

    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.imageUrl || PRODUCT_IMAGE_FALLBACK;
    image.alt = product.name;
    image.loading = "lazy";
    imageWrap.append(image);

    const content = document.createElement("div");
    content.className = "product-content";

    const title = document.createElement("h3");
    title.textContent = product.name;

    const wave = document.createElement("p");
    wave.className = "product-wave";
    wave.textContent = product.waveName;

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = product.description;

    const meta = document.createElement("div");
    meta.className = "product-meta";

    const price = document.createElement("span");
    price.className = "price";
    price.textContent = formatPriceFromPence(product.pricePence);

    const condition = document.createElement("span");
    condition.className = "detail-pill";
    condition.textContent = product.condition || "Condition not listed";

    const stock = document.createElement("span");
    stock.className = product.remainingStock > 0 ? "stock-pill" : "stock-pill is-empty";
    stock.textContent = product.remainingStock > 0 ? `${product.remainingStock} remaining` : "Sold out";

    const limit = document.createElement("span");
    limit.className = "detail-pill";
    limit.textContent = product.perCustomerLimit ? `Limit ${product.perCustomerLimit} per customer` : "No customer limit listed";

    meta.append(price, condition, stock, limit);

    content.append(wave, title, description, meta, createCatalogueBasketControl(product));
    card.append(imageWrap, content);
    productGrid.append(card);
  });
}

function createCatalogueBasketControl(product) {
  const basketItem = getBasketItemForProduct(product);

  if (basketItem) {
    return createCatalogueQuantityControl(product, basketItem);
  }

  const wrap = document.createElement("div");
  wrap.className = "catalogue-action";

  const buyButton = document.createElement("button");
  buyButton.className = "buy-button";
  buyButton.type = "button";
  buyButton.disabled = product.remainingStock <= 0 || state.basket.isBusy;
  buyButton.textContent = getCatalogueButtonText(product);
  buyButton.addEventListener("click", () => handleAddToBasket(product));

  const hint = document.createElement("p");
  hint.className = "catalogue-action-note";
  hint.textContent = getCatalogueActionNote(product, null);

  wrap.append(buyButton, hint);
  return wrap;
}

function createCatalogueQuantityControl(product, basketItem) {
  const wrap = document.createElement("div");
  wrap.className = "catalogue-action is-in-basket";

  const status = document.createElement("p");
  status.className = "catalogue-basket-status";
  status.textContent = `In basket: ${basketItem.quantity}`;

  const controls = document.createElement("div");
  controls.className = "catalogue-quantity-controls";

  const decrease = document.createElement("button");
  decrease.className = "quantity-button";
  decrease.type = "button";
  decrease.textContent = "-";
  decrease.disabled = state.basket.isBusy;
  decrease.setAttribute("aria-label", `Decrease ${product.name} quantity`);
  decrease.addEventListener("click", () => changeBasketQuantity(basketItem.id, basketItem.quantity - 1));

  const quantity = document.createElement("span");
  quantity.className = "quantity-value catalogue-quantity-value";
  quantity.textContent = String(basketItem.quantity);

  const increase = document.createElement("button");
  increase.className = "quantity-button";
  increase.type = "button";
  increase.textContent = "+";
  increase.disabled = state.basket.isBusy || !canIncreaseCatalogueItem(product, basketItem);
  increase.setAttribute("aria-label", `Increase ${product.name} quantity`);
  increase.addEventListener("click", () => handleAddToBasket(product));

  const remove = document.createElement("button");
  remove.className = "remove-button";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.disabled = state.basket.isBusy;
  remove.addEventListener("click", () => removeBasketItem(basketItem.id));

  controls.append(decrease, quantity, increase, remove);

  const hint = document.createElement("p");
  hint.className = "catalogue-action-note";
  hint.textContent = getCatalogueActionNote(product, basketItem);

  wrap.append(status, controls, hint);
  return wrap;
}

function getCatalogueButtonText(product) {
  if (product.remainingStock <= 0) {
    return "Sold out";
  }

  if (!state.user) {
    return "Sign in to add";
  }

  return "Add to basket";
}

function getCatalogueActionNote(product, basketItem) {
  if (product.remainingStock <= 0) {
    return "No stock remaining.";
  }

  if (!state.user) {
    return "Sign in to save this item.";
  }

  if (!basketItem) {
    return product.perCustomerLimit ? `You can add up to ${product.perCustomerLimit}.` : "Add this wave to your saved basket.";
  }

  if (product.perCustomerLimit && basketItem.quantity >= product.perCustomerLimit) {
    return `Limit reached: ${product.perCustomerLimit} per customer.`;
  }

  if (basketItem.quantity >= product.remainingStock) {
    return "All remaining stock is already in your basket.";
  }

  return product.perCustomerLimit
    ? `${Math.max(product.perCustomerLimit - basketItem.quantity, 0)} more allowed.`
    : "You can add more while stock remains.";
}

function getBasketItemForProduct(product) {
  return state.basket.items.find((item) => item.restockWaveId === product.id) || null;
}

function canIncreaseCatalogueItem(product, basketItem) {
  if (product.remainingStock <= 0) {
    return false;
  }

  if (product.perCustomerLimit && basketItem.quantity >= product.perCustomerLimit) {
    return false;
  }

  if (basketItem.quantity >= product.remainingStock) {
    return false;
  }

  return true;
}

function normalizeCatalogueWave(row) {
  const product = Array.isArray(row.products) ? row.products[0] : row.products || {};
  const pricePence = Number(row.price_pence);
  const remainingStock = Number(row.remaining_stock_quantity);
  const perCustomerLimit = Number(row.per_customer_limit);

  return {
    id: String(row.id || ""),
    waveName: String(row.name || "Standard restock").trim(),
    name: String(product.name || "Untitled product").trim(),
    description: String(product.description || "").trim(),
    condition: String(product.product_condition || "").trim(),
    imageUrl: String(product.image_url || PRODUCT_IMAGE_FALLBACK).trim(),
    pricePence: Number.isFinite(pricePence) && pricePence >= 0 ? Math.round(pricePence) : 0,
    remainingStock: Number.isFinite(remainingStock) && remainingStock >= 0 ? Math.floor(remainingStock) : 0,
    perCustomerLimit: Number.isFinite(perCustomerLimit) && perCustomerLimit > 0 ? Math.floor(perCustomerLimit) : null,
  };
}

function createCatalogueState(title, message, modifier = "") {
  const card = document.createElement("div");
  card.className = modifier ? `catalogue-state ${modifier}` : "catalogue-state";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = message;

  card.append(heading, copy);
  return card;
}

function formatPriceFromPence(pricePence) {
  return priceFormatter.format(pricePence / 100);
}

async function loadBasket() {
  if (!state.user || !supabaseClient) {
    resetBasket("signed-out", "Sign in to view your saved basket.");
    return;
  }

  state.basket.status = "loading";
  state.basket.message = "";
  state.basket.messageIsError = false;
  renderBasket();

  const basket = await getActiveBasket(false);

  if (basket === BASKET_QUERY_FAILED) {
    state.basket.items = [];
    state.basket.status = "error";
    renderBasket();
    return;
  }

  if (!basket) {
    state.basket.id = null;
    state.basket.items = [];
    state.basket.status = "ready";
    state.basket.message = "";
    state.basket.messageIsError = false;
    renderBasket();
    renderStore();
    return;
  }

  state.basket.id = basket.id;

  const { data, error } = await supabaseClient
    .from("basket_items")
    .select(
      `
        id,
        basket_id,
        restock_wave_id,
        quantity,
        restock_waves (
          id,
          name,
          sale_type,
          status,
          price_pence,
          remaining_stock_quantity,
          per_customer_limit,
          products (
            name,
            image_url,
            is_active
          )
        )
      `,
    )
    .eq("basket_id", basket.id)
    .order("id", { ascending: true });

  if (error) {
    state.basket.items = [];
    state.basket.status = "error";
    state.basket.message = getDatabaseMessage(error, "We could not load your basket.");
    state.basket.messageIsError = true;
    renderBasket();
    return;
  }

  state.basket.items = (data || []).map(normalizeBasketItem);
  state.basket.status = "ready";
  state.basket.message = "";
  state.basket.messageIsError = false;
  renderBasket();
  renderStore();
}

function resetBasket(status, message = "") {
  state.basket.id = null;
  state.basket.items = [];
  state.basket.status = status;
  state.basket.message = message;
  state.basket.messageIsError = false;
  state.basket.isBusy = false;
  renderBasket();
  renderStore();
}

async function getActiveBasket(shouldCreate) {
  const { data, error } = await supabaseClient
    .from("baskets")
    .select("id, user_id, status")
    .eq("user_id", state.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    setBasketMessage(getDatabaseMessage(error, "We could not find your basket."), true);
    return BASKET_QUERY_FAILED;
  }

  if (data || !shouldCreate) {
    return data;
  }

  const { data: created, error: createError } = await supabaseClient
    .from("baskets")
    .insert({
      user_id: state.user.id,
      status: "active",
    })
    .select("id, user_id, status")
    .single();

  if (!createError) {
    return created;
  }

  const { data: existing, error: existingError } = await supabaseClient
    .from("baskets")
    .select("id, user_id, status")
    .eq("user_id", state.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (existingError || !existing) {
    setBasketMessage(getDatabaseMessage(createError, "We could not create your basket."), true);
    return BASKET_QUERY_FAILED;
  }

  return existing;
}

async function handleAddToBasket(product) {
  if (!state.user) {
    setBasketMessage("Sign in to add items to your basket.");
    openPanel();
    return;
  }

  if (product.remainingStock <= 0) {
    showToast("This item is sold out.");
    return;
  }

  setBasketBusy(true);
  const basket = await getActiveBasket(true);

  if (!basket || basket === BASKET_QUERY_FAILED) {
    setBasketBusy(false);
    openBasketPanel();
    return;
  }

  const { data: existingItem, error: existingError } = await supabaseClient
    .from("basket_items")
    .select("id, quantity")
    .eq("basket_id", basket.id)
    .eq("restock_wave_id", product.id)
    .maybeSingle();

  if (existingError) {
    setBasketBusy(false);
    setBasketMessage(getDatabaseMessage(existingError, "We could not check your basket."), true);
    openBasketPanel();
    await loadBasket();
    return;
  }

  const currentQuantity = Number(existingItem?.quantity || 0);
  const nextQuantity = currentQuantity + 1;

  if (product.perCustomerLimit && nextQuantity > product.perCustomerLimit) {
    setBasketBusy(false);
    showToast(`Limit ${product.perCustomerLimit} per customer.`);
    return;
  }

  if (nextQuantity > product.remainingStock) {
    setBasketBusy(false);
    showToast("There is not enough stock remaining.");
    return;
  }

  const write = existingItem
    ? supabaseClient.from("basket_items").update({ quantity: nextQuantity }).eq("id", existingItem.id)
    : supabaseClient.from("basket_items").insert({
        basket_id: basket.id,
        restock_wave_id: product.id,
        quantity: 1,
      });

  const { error } = await write;
  setBasketBusy(false);

  if (error) {
    const message = getDatabaseMessage(error, "We could not add that item to your basket.");
    await loadBasket();
    setBasketMessage(message, true);
    openBasketPanel();
    return;
  }

  showToast("Added to basket.");
  await loadBasket();
}

async function changeBasketQuantity(itemId, nextQuantity) {
  const item = state.basket.items.find((basketItem) => basketItem.id === itemId);

  if (!item) {
    return;
  }

  if (nextQuantity < 1) {
    await removeBasketItem(itemId);
    return;
  }

  if (item.perCustomerLimit && nextQuantity > item.perCustomerLimit) {
    setBasketMessage(`Limit ${item.perCustomerLimit} per customer.`);
    return;
  }

  if (item.remainingStock !== null && nextQuantity > item.remainingStock) {
    setBasketMessage("There is not enough stock remaining.");
    return;
  }

  setBasketBusy(true);
  const { error } = await supabaseClient.from("basket_items").update({ quantity: nextQuantity }).eq("id", itemId);
  setBasketBusy(false);

  if (error) {
    const message = getDatabaseMessage(error, "We could not update that basket item.");
    await loadBasket();
    setBasketMessage(message, true);
    return;
  }

  await loadBasket();
}

async function removeBasketItem(itemId) {
  setBasketBusy(true);
  const { error } = await supabaseClient.from("basket_items").delete().eq("id", itemId);
  setBasketBusy(false);

  if (error) {
    const message = getDatabaseMessage(error, "We could not remove that basket item.");
    await loadBasket();
    setBasketMessage(message, true);
    return;
  }

  await loadBasket();
}

function renderBasket() {
  const totalQuantity = state.basket.items.reduce((total, item) => total + item.quantity, 0);
  const totalPrice = state.basket.items.reduce((total, item) => total + item.quantity * (item.pricePence || 0), 0);

  basketCount.textContent = String(totalQuantity);
  basketCount.setAttribute("aria-label", `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} in basket`);
  basketMessage.textContent = state.basket.message;
  basketMessage.classList.toggle("is-error", state.basket.messageIsError);
  basketMessage.hidden = !state.basket.message;
  basketItems.replaceChildren();
  basketSummary.hidden = true;
  basketTotal.textContent = formatPriceFromPence(totalPrice);

  if (state.basket.status === "signed-out") {
    basketItems.append(createBasketState("Sign in to use your basket", "Your saved basket is linked to your customer account."));
    return;
  }

  if (state.basket.status === "loading") {
    basketItems.append(createBasketState("Loading basket", "Checking your saved items..."));
    return;
  }

  if (state.basket.status === "error") {
    basketItems.append(createBasketState("Basket unavailable", "Please try again in a moment."));
    return;
  }

  if (!state.basket.items.length) {
    basketItems.append(createBasketState("Your basket is empty", "Add an active restock wave when you are ready."));
    return;
  }

  state.basket.items.forEach((item) => {
    basketItems.append(createBasketItemElement(item));
  });

  basketSummary.hidden = false;
}

function createBasketState(title, message) {
  const stateCard = document.createElement("div");
  stateCard.className = "basket-state";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = message;

  stateCard.append(heading, copy);
  return stateCard;
}

function createBasketItemElement(item) {
  const row = document.createElement("article");
  row.className = item.isAvailable ? "basket-item" : "basket-item is-unavailable";

  const image = document.createElement("img");
  image.className = "basket-item-image";
  image.src = item.imageUrl || PRODUCT_IMAGE_FALLBACK;
  image.alt = item.productName;
  image.loading = "lazy";

  const body = document.createElement("div");
  body.className = "basket-item-body";

  const header = document.createElement("div");
  header.className = "basket-item-header";

  const titleWrap = document.createElement("div");
  const wave = document.createElement("p");
  wave.className = "product-wave";
  wave.textContent = item.waveName;
  const title = document.createElement("h3");
  title.textContent = item.productName;
  titleWrap.append(wave, title);

  const subtotal = document.createElement("strong");
  subtotal.textContent = item.pricePence === null ? "Unavailable" : formatPriceFromPence(item.pricePence * item.quantity);
  header.append(titleWrap, subtotal);

  const meta = document.createElement("div");
  meta.className = "basket-item-meta";
  meta.append(
    createMetaPill(item.pricePence === null ? "Price unavailable" : formatPriceFromPence(item.pricePence)),
    createMetaPill(`Qty ${item.quantity}`),
    createMetaPill(item.remainingStock === null ? "Stock unavailable" : `${item.remainingStock} remaining`),
    createMetaPill(item.perCustomerLimit ? `Limit ${item.perCustomerLimit}` : "No limit listed"),
  );

  if (!item.isAvailable) {
    const warning = document.createElement("p");
    warning.className = "basket-item-warning";
    warning.textContent = "This item is no longer available.";
    body.append(header, meta, warning, createBasketItemControls(item));
  } else {
    body.append(header, meta, createBasketItemControls(item));
  }

  row.append(image, body);
  return row;
}

function createBasketItemControls(item) {
  const controls = document.createElement("div");
  controls.className = "basket-controls";

  const decrease = document.createElement("button");
  decrease.className = "quantity-button";
  decrease.type = "button";
  decrease.textContent = "-";
  decrease.setAttribute("aria-label", `Decrease ${item.productName} quantity`);
  decrease.addEventListener("click", () => changeBasketQuantity(item.id, item.quantity - 1));

  const quantity = document.createElement("span");
  quantity.className = "quantity-value";
  quantity.textContent = String(item.quantity);

  const increase = document.createElement("button");
  increase.className = "quantity-button";
  increase.type = "button";
  increase.textContent = "+";
  increase.disabled = !canIncreaseBasketItem(item);
  increase.setAttribute("aria-label", `Increase ${item.productName} quantity`);
  increase.addEventListener("click", () => changeBasketQuantity(item.id, item.quantity + 1));

  const remove = document.createElement("button");
  remove.className = "remove-button";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => removeBasketItem(item.id));

  controls.append(decrease, quantity, increase, remove);
  return controls;
}

function createMetaPill(text) {
  const pill = document.createElement("span");
  pill.className = "detail-pill";
  pill.textContent = text;
  return pill;
}

function normalizeBasketItem(row) {
  const wave = Array.isArray(row.restock_waves) ? row.restock_waves[0] : row.restock_waves;
  const product = Array.isArray(wave?.products) ? wave.products[0] : wave?.products;
  const quantity = Number(row.quantity);
  const pricePence = Number(wave?.price_pence);
  const remainingStock = Number(wave?.remaining_stock_quantity);
  const perCustomerLimit = Number(wave?.per_customer_limit);
  const isAvailable = Boolean(
    wave &&
      product &&
      wave.status === "active" &&
      wave.sale_type === NORMAL_SALE_TYPE &&
      product.is_active &&
      Number.isFinite(remainingStock) &&
      remainingStock > 0,
  );

  return {
    id: String(row.id || ""),
    restockWaveId: String(row.restock_wave_id || wave?.id || ""),
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    productName: product?.name || "This item is no longer available",
    waveName: wave?.name || "Unavailable item",
    imageUrl: product?.image_url || PRODUCT_IMAGE_FALLBACK,
    pricePence: Number.isFinite(pricePence) && pricePence >= 0 ? Math.round(pricePence) : null,
    remainingStock: Number.isFinite(remainingStock) && remainingStock >= 0 ? Math.floor(remainingStock) : null,
    perCustomerLimit: Number.isFinite(perCustomerLimit) && perCustomerLimit > 0 ? Math.floor(perCustomerLimit) : null,
    isAvailable,
  };
}

function canIncreaseBasketItem(item) {
  if (!item.isAvailable) {
    return false;
  }

  if (item.perCustomerLimit && item.quantity >= item.perCustomerLimit) {
    return false;
  }

  if (item.remainingStock !== null && item.quantity >= item.remainingStock) {
    return false;
  }

  return true;
}

function setBasketBusy(isBusy) {
  state.basket.isBusy = isBusy;
  basketPanel.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy;
  });
  renderStore();
}

function setBasketMessage(message, isError = false) {
  state.basket.message = message;
  state.basket.messageIsError = isError;
  renderBasket();
}

function getDatabaseMessage(error, fallback) {
  return error?.message || fallback;
}

function renderAccount() {
  const signedIn = Boolean(state.user);

  signedOutView.hidden = signedIn;
  signedInView.hidden = !signedIn;
  setAuthMode(state.authMode, false);

  if (!supabaseClient) {
    setAuthMessage("Paste your Supabase Project URL and Publishable Key in app.js to enable accounts.");
  }

  if (signedIn) {
    accountEmail.textContent = state.user.email || "Account";
    accountEmailDetail.textContent = state.user.email || "Signed in";
  } else {
    accountEmail.textContent = "Account";
    accountEmailDetail.textContent = "";
  }
}

function setAuthMode(mode, shouldClearMessages = true) {
  state.authMode = mode;

  const isSignIn = mode === "sign-in";

  signInForm.hidden = !isSignIn;
  signUpForm.hidden = isSignIn;
  showSignInButton.classList.toggle("is-active", isSignIn);
  showSignUpButton.classList.toggle("is-active", !isSignIn);
  showSignInButton.setAttribute("aria-selected", String(isSignIn));
  showSignUpButton.setAttribute("aria-selected", String(!isSignIn));
  showSignInButton.tabIndex = isSignIn ? 0 : -1;
  showSignUpButton.tabIndex = isSignIn ? -1 : 0;

  if (shouldClearMessages) {
    clearAuthMessages();
  }
}

function handleAuthTabsKeydown(event) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];

  if (!keys.includes(event.key)) {
    return;
  }

  event.preventDefault();

  const tabs = [showSignInButton, showSignUpButton];
  const currentIndex = tabs.indexOf(document.activeElement);
  let nextIndex = currentIndex === -1 ? 0 : currentIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (nextIndex + 1) % tabs.length;
  }

  if (event.key === "ArrowLeft") {
    nextIndex = (nextIndex - 1 + tabs.length) % tabs.length;
  }

  if (event.key === "Home") {
    nextIndex = 0;
  }

  if (event.key === "End") {
    nextIndex = tabs.length - 1;
  }

  setAuthMode(nextIndex === 0 ? "sign-in" : "sign-up");
  tabs[nextIndex].focus();
}

function setSession(session) {
  state.session = session;
  state.user = session?.user ?? null;
}

function setAuthBusy(isBusy) {
  signInForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = isBusy;
  });

  signUpForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = isBusy;
  });

  signOutButton.disabled = isBusy;
}

function requireSupabaseConfig() {
  if (supabaseClient) {
    return true;
  }

  setAuthMessage("Paste your Supabase Project URL and Publishable Key in app.js to enable accounts.");
  return false;
}

function setAuthError(message) {
  authError.textContent = message;
  authMessage.textContent = "";
}

function setAuthMessage(message) {
  authMessage.textContent = message;
  authError.textContent = "";
}

function clearAuthMessages() {
  authError.textContent = "";
  authMessage.textContent = "";
}

function openPanel() {
  closeBasketDrawer(false);
  accountPanel.classList.add("is-open");
  accountPanel.setAttribute("aria-hidden", "false");
  accountToggle.setAttribute("aria-expanded", "true");
  panelOverlay.hidden = false;
  window.setTimeout(focusAccountPanel, 0);
}

function closeAccountPanel(shouldFocus = true) {
  accountPanel.classList.remove("is-open");
  accountPanel.setAttribute("aria-hidden", "true");
  accountToggle.setAttribute("aria-expanded", "false");

  if (!basketPanel.classList.contains("is-open")) {
    panelOverlay.hidden = true;
  }

  if (shouldFocus) {
    accountToggle.focus();
  }
}

function openBasketPanel() {
  closeAccountPanel(false);
  basketPanel.classList.add("is-open");
  basketPanel.setAttribute("aria-hidden", "false");
  basketToggle.setAttribute("aria-expanded", "true");
  panelOverlay.hidden = false;
  window.setTimeout(focusBasketPanel, 0);
}

function closeBasketDrawer(shouldFocus = true) {
  basketPanel.classList.remove("is-open");
  basketPanel.setAttribute("aria-hidden", "true");
  basketToggle.setAttribute("aria-expanded", "false");

  if (!accountPanel.classList.contains("is-open")) {
    panelOverlay.hidden = true;
  }

  if (shouldFocus) {
    basketToggle.focus();
  }
}

function closeOpenPanels() {
  const accountWasOpen = accountPanel.classList.contains("is-open");
  const basketWasOpen = basketPanel.classList.contains("is-open");

  closeAccountPanel(false);
  closeBasketDrawer(false);

  if (basketWasOpen) {
    basketToggle.focus();
    return;
  }

  if (accountWasOpen) {
    accountToggle.focus();
  }
}

function isAnyPanelOpen() {
  return accountPanel.classList.contains("is-open") || basketPanel.classList.contains("is-open");
}

function focusAccountPanel() {
  if (state.user) {
    signOutButton.focus();
    return;
  }

  const activeForm = state.authMode === "sign-in" ? signInForm : signUpForm;
  const firstInput = activeForm.querySelector("input");
  firstInput?.focus();
}

function focusBasketPanel() {
  const firstButton = basketPanel.querySelector("button:not(:disabled)");
  firstButton?.focus();
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}
