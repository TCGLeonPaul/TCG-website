const PRODUCTS_STORAGE_KEY = "tcg-store-products-v1";
const CURRENCY = "USD";

const SUPABASE_PROJECT_URL = "https://dwkvwzyarrkfhzsqkeof.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1VUFWbvJj9n7lW6uFP8vMw_cYbyLGWD";

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

const isSupabaseConfigured = Boolean(SUPABASE_PROJECT_URL && SUPABASE_PUBLISHABLE_KEY);

const supabaseClient = createSupabaseClient();

const state = {
  products: loadProducts(),
  session: null,
  user: null,
  authMode: "sign-in",
  authReady: false,
};

const productGrid = document.querySelector("#productGrid");
const accountToggle = document.querySelector("#accountToggle");
const accountPanel = document.querySelector("#accountPanel");
const panelOverlay = document.querySelector("#panelOverlay");
const closePanel = document.querySelector("#closePanel");
const signedOutView = document.querySelector("#signedOutView");
const signedInView = document.querySelector("#signedInView");
const showSignInButton = document.querySelector("#showSignIn");
const showSignUpButton = document.querySelector("#showSignUp");
const signInForm = document.querySelector("#signInForm");
const signUpForm = document.querySelector("#signUpForm");
const signOutButton = document.querySelector("#signOutButton");
const authError = document.querySelector("#authError");
const authMessage = document.querySelector("#authMessage");
const accountEmail = document.querySelector("#accountEmail");
const accountEmailDetail = document.querySelector("#accountEmailDetail");
const toast = document.querySelector("#toast");

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
});

let toastTimeout;

renderStore();
renderAccount();
initializeAuth();

accountToggle.addEventListener("click", openPanel);
closePanel.addEventListener("click", closeAccountPanel);
panelOverlay.addEventListener("click", closeAccountPanel);
showSignInButton.addEventListener("click", () => setAuthMode("sign-in"));
showSignUpButton.addEventListener("click", () => setAuthMode("sign-up"));
signInForm.addEventListener("submit", handleSignIn);
signUpForm.addEventListener("submit", handleSignUp);
signOutButton.addEventListener("click", handleSignOut);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && accountPanel.classList.contains("is-open")) {
    closeAccountPanel();
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

  supabaseClient.auth.onAuthStateChange((event, session) => {
    setSession(session);

    if (event === "SIGNED_IN") {
      showToast("Signed in.");
    }

    if (event === "SIGNED_OUT") {
      showToast("Signed out.");
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
  renderAccount();
}

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
    buyButton.disabled = true;
    buyButton.textContent = "Unavailable";

    content.append(title, description, meta, buyButton);
    card.append(imageWrap, content);
    productGrid.append(card);
  });
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
  showSignInButton.setAttribute("aria-pressed", String(isSignIn));
  showSignUpButton.setAttribute("aria-pressed", String(!isSignIn));

  if (shouldClearMessages) {
    clearAuthMessages();
  }
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
  accountPanel.classList.add("is-open");
  accountPanel.setAttribute("aria-hidden", "false");
  accountToggle.setAttribute("aria-expanded", "true");
  panelOverlay.hidden = false;
}

function closeAccountPanel() {
  accountPanel.classList.remove("is-open");
  accountPanel.setAttribute("aria-hidden", "true");
  accountToggle.setAttribute("aria-expanded", "false");
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
