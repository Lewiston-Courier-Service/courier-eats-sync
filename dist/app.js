let restaurants = [];
let corporateRestaurants = [];
let localRestaurantsLoadError = "";
let corporateRestaurantsLoadError = "";
let selectedCategory = "Breakfast";
let cart = [];
let cartLocationId = null;
let cartRestaurantName = "";
function escapeHTML(value) {
const div =
document.createElement("div");
div.textContent =
String(value ?? "");
return div.innerHTML;
}
function money(cents) {
const amount =
Number(cents);
if (!Number.isFinite(amount)) {
return "";
}
return (
"$" +
(amount / 100).toFixed(2)
);
}
const LOCAL_ONLINE_ORDERING = [
  {
    match: ["legends sports bar", "legends"],
    url: "https://order.toasttab.com/online/legends-sports-bar-and-grill-4-mollison-way",
    label: "Order Online"
  },
  {
    match: ["orchid of lewiston", "orchid lewiston", "orchid"],
    url: "https://order.toasttab.com/online/orchid-restaurant-and-bar-29-lisbon-st",
    label: "Order Online"
  },
  {
    match: ["mac's downeast seafood", "macs downeast seafood", "mac's seafood", "macs seafood"],
    url: "https://order.online/store/mac-s-downeast-seafood-minot-ave-23038006",
    label: "Order Online"
  },
  {
    match: ["val's drive in", "vals drive in", "val's drive-in", "vals drive-in"],
    url: "https://order.online/store/val%27s-drive-in-lewiston-28473272",
    label: "Order Online"
  },
  {
    match: ["kp's place", "kps place", "kp's"],
    url: "https://kpsplacemaine.com/order",
    label: "Order Online"
  },
  {
    match: ["grant's bakery", "grants bakery"],
    url: "https://grantsbakery.com/",
    label: "Order Online"
  },
  {
    match: ["mancini's italian deli", "mancinis italian deli"],
    url: "https://order.toasttab.com/online/mancinis-italian-deli-5-park-street",
    label: "Order Online"
  },
  {
    match: ["labadie's bakery", "labadies bakery"],
    url: "https://labadiesbakery.com/",
    label: "Shop Online"
  },
  {
    match: ["the maine grill", "maine grill"],
    url: "https://www.grubhub.com/restaurant/the-maine-grill-490-pleasant-street-lewiston/15055232",
    label: "Order Online"
  },
  {
    match: ["tina thai"],
    url: "https://www.ordertinathaiexpress.com/order",
    label: "Order Online"
  },
  {
    match: ["pure thai"],
    url: "https://purethaikitchenme.smiledining.com/",
    label: "Order Online"
  },
  {
    match: ["forage"],
    url: "https://order.toasttab.com/online/foragelewiston",
    label: "Order Online"
  },
  {
    match: ["cibo pizza", "cibo"],
    url: "https://order.toasttab.com/online/cibo-pizza",
    label: "Order Online"
  },
  {
    match: ["gridiron"],
    url: "https://gridiron.biz-os.app/weborder/wo_order_time.php?loc=GridironRestaurantampSportsPub04240",
    label: "Order Online"
  },
  {
    match: ["marco's", "marcos"],
    url: "https://order.online/store/marcos-italian-restaurante-559284",
    label: "Order Online"
  },
  {
    match: ["happy days"],
    url: "https://order.online/store/happy-days-diner-558584",
    label: "Order Online"
  },
  {
    match: ["orchid"],
    url: "https://order.online/store/2396901",
    label: "Order Online"
  },
  {
    match: ["bua thai", "bua"],
    url: "https://order.online/store/bua-thai-%26-sushi-lewiston-559183",
    label: "Order Online"
  },
  {
    match: ["governor's", "governors"],
    url: "https://order.online/store/GovernorsRestaurantBakery-559063/",
    label: "Order Online"
  },
  {
    match: ["lewiston house of pizza", "lhop"],
    url: "https://slicelife.com/restaurants/me/lewiston/04240/lewiston-house-of-pizza/menu",
    label: "Order Online"
  },
  {
    match: ["pizza market"],
    url: "https://www.beyondmenu.com/29791/auburn/pizza-market-auburn-04210.aspx",
    label: "Order Online"
  },
  {
    match: ["burnt ends"],
    url: "https://order.toasttab.com/online/burnt-ends-barbecue",
    label: "Order Online"
  },
  {
    match: ["davinci", "da vinci"],
    url: "https://order.toasttab.com/online/davincis-eatery-150-mill-st",
    label: "Order Online"
  }
];

function localOnlineOrderFor(restaurant) {
  const name = String(restaurant?.name || "").trim().toLowerCase();

  return (
    LOCAL_ONLINE_ORDERING.find(entry =>
      entry.match.some(term => name.includes(term))
    ) || null
  );
}

const LOCAL_BRAND_DOMAINS = [
  { match: ["marco's restaurant", "marcos restaurant", "marco's", "marcos"], domain: "marcosrestaurantmaine.com" },
  { match: ["legends sports bar", "legends"], domain: "legendsmaine.com" },
  { match: ["grant's bakery", "grants bakery"], domain: "grantsbakery.com" },
  { match: ["labadie's bakery", "labadies bakery"], domain: "labadiesbakery.com" },
  { match: ["kp's place", "kps place", "kp's"], domain: "kpsplacemaine.com" },
  { match: ["tina thai"], domain: "ordertinathaiexpress.com" },
  { match: ["the italian bakery", "italian bakery"], domain: "theitalianbakeryme.com" }
];

const LOCAL_BRAND_PALETTE = [
  ["#b64036", "#f1b24a", "#fff2e3"],
  ["#235347", "#78a083", "#edf7f1"],
  ["#5d3a9b", "#b79ced", "#f3effc"],
  ["#0f5f8f", "#5fb3d3", "#edf8fc"],
  ["#8a3b12", "#d98324", "#fff3e8"],
  ["#31572c", "#90a955", "#f3f8e9"],
  ["#7b2d45", "#d66d8a", "#fceef3"],
  ["#1f4e79", "#76a5d6", "#eef5fc"]
];

function localBrandPresentation(restaurant) {
  const name = String(restaurant?.name || "").trim();
  const lower = name.toLowerCase();

  const domainMatch = LOCAL_BRAND_DOMAINS.find(entry =>
    entry.match.some(term => lower.includes(term))
  );

  let hash = 0;
  for (const character of lower) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  const palette = LOCAL_BRAND_PALETTE[Math.abs(hash) % LOCAL_BRAND_PALETTE.length];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "CE";

  return {
    domain: domainMatch?.domain || "",
    logoUrl: domainMatch?.domain
      ? "https://www.google.com/s2/favicons?domain=" +
        encodeURIComponent(domainMatch.domain) +
        "&sz=128"
      : "",
    initials,
    accent: palette[0],
    accent2: palette[1],
    soft: palette[2]
  };
}

const CORPORATE_BRAND_PRESENTATION = {
  "Popeyes": {
    key: "popeyes",
    domain: "popeyes.com",
    initials: "P"
  },
  "McDonald's": {
    key: "mcdonalds",
    domain: "mcdonalds.com",
    initials: "M"
  },
  "Burger King": {
    key: "burger-king",
    domain: "bk.com",
    initials: "BK"
  },
  "IHOP": {
    key: "ihop",
    domain: "ihop.com",
    initials: "IH"
  },
  "Buffalo Wild Wings": {
    key: "buffalo-wild-wings",
    domain: "buffalowildwings.com",
    initials: "BWW"
  },
  "Olive Garden": {
    key: "olive-garden",
    domain: "olivegarden.com",
    initials: "OG"
  },
  "99 Restaurants": {
    key: "99-restaurants",
    domain: "99restaurants.com",
    initials: "99"
  },
  "Applebee's": {
    key: "applebees",
    domain: "applebees.com",
    initials: "A"
  },
  "LongHorn Steakhouse": {
    key: "longhorn",
    domain: "longhornsteakhouse.com",
    initials: "LH"
  },
  "Denny's": {
    key: "dennys",
    domain: "dennys.com",
    initials: "D"
  },
  "KFC": {
    key: "kfc",
    domain: "kfc.com",
    initials: "KFC"
  }
};

function corporateBrandPresentation(restaurant) {
  const brand = String(restaurant.brand || "").trim();
  const presentation =
    CORPORATE_BRAND_PRESENTATION[brand] || {
      key: "default",
      domain: "",
      initials: brand.slice(0, 2).toUpperCase() || "CE"
    };

  const logoUrl = presentation.domain
    ? "https://www.google.com/s2/favicons?domain=" +
      encodeURIComponent(presentation.domain) +
      "&sz=128"
    : "";

  return {
    ...presentation,
    logoUrl
  };
}

async function loadCorporateRestaurants() {
  try {
    const response = await fetch("/api/corporate/restaurants", {
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Corporate restaurant API returned " + response.status
      );
    }

    corporateRestaurants = Array.isArray(data.restaurants)
      ? data.restaurants.filter(restaurant => restaurant.deliveryEnabled !== false)
      : [];
    corporateRestaurantsLoadError = "";
  } catch (error) {
    console.error(error);
    corporateRestaurants = [];
    corporateRestaurantsLoadError = error.message || "Unable to load Order Direct restaurants.";
  }

  renderRestaurants();
}

const RESTAURANT_CATEGORY_TABS = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Bakery",
  "Pizza",
  "World Food"
];

const LOCAL_BREAKFAST_NAME_HINTS = [
  "breakfast",
  "brunch",
  "cafe",
  "café",
  "diner",
  "bakery",
  "donut",
  "forage",
  "dubois",
  "kristi",
  "rolly",
  "roy's allsteak",
  "roys allsteak"
];

const LOCAL_BAKERY_NAME_HINTS = [
  "bakery",
  "cup cakery",
  "cupcakery",
  "cupcake",
  "donut",
  "forage"
];

const LOCAL_PIZZA_NAME_HINTS = [
  "pizza",
  "house of pizza",
  "cibo",
  "georgio"
];

const LOCAL_WORLD_FOOD_NAME_HINTS = [
  "mother india",
  "indian",
  "el pocho",
  "mexican",
  "thai",
  "jamaican",
  "bua",
  "orchid",
  "sushi",
  "asian",
  "vietnam",
  "korean"
];

const LOCAL_CATEGORY_OVERRIDES = [
  { match: ["kristi's cafe", "kristis cafe", "kristi cafe"], categories: ["Breakfast", "Lunch"] },
  { match: ["roy's all steak hamburgers", "roys all steak hamburgers", "roy's allsteak", "roys allsteak"], categories: ["Breakfast", "Lunch", "Dinner"] },
  { match: ["fran's restaurant", "frans restaurant", "fran's"], categories: ["Breakfast", "Lunch"] },
  { match: ["marco's restaurant", "marcos restaurant", "marco's", "marcos"], categories: ["Lunch", "Dinner", "Pizza"] },
  { match: ["legends sports bar", "legends"], categories: ["Lunch", "Dinner"] },
  { match: ["pinky d's poutine", "pinky ds poutine", "pinky d's poutine factory"], categories: ["Lunch", "Dinner"] },
  { match: ["orchid of lewiston", "orchid lewiston", "orchid"], categories: ["Lunch", "Dinner", "World Food"] },
  { match: ["always fresh la rochelle", "always fresh larochelle", "larochelle seafood", "la rochelle's"], categories: ["Lunch", "Dinner"] },
  { match: ["fire house grill", "firehouse grill", "fire house grille", "firehouse grille"], categories: ["Lunch", "Dinner"] },
  { match: ["mac's grill", "macs grill"], categories: ["Lunch", "Dinner"] },
  { match: ["mac's downeast seafood", "macs downeast seafood", "mac's seafood", "macs seafood"], categories: ["Lunch", "Dinner"] },
  { match: ["ms. claws", "ms claws", "ms claws lobster and seafood"], categories: ["Lunch", "Dinner"] },
  { match: ["marvelous macarons", "marvelous macaroons"], categories: ["Bakery"] },
  { match: ["simones' hot dog stand", "simones hot dog", "simone's hot dog", "simones hot dog stand"], categories: ["Breakfast", "Lunch"] },
  { match: ["happy days diner", "happy days"], categories: ["Breakfast", "Lunch"] },
  { match: ["jeff's jamaican cuisine", "jeffs jamaican cuisine", "jeff's jamaican"], categories: ["Lunch", "Dinner", "World Food"] },
  { match: ["val's drive in", "vals drive in", "val's drive-in", "vals drive-in"], categories: ["Lunch", "Dinner"] },
  { match: ["kp's place", "kps place", "kp's"], categories: ["Lunch", "Dinner"] },
  { match: ["the italian bakery", "italian bakery"], categories: ["Breakfast", "Lunch", "Bakery", "Pizza"] },
  { match: ["the cupcakery", "cupcakery"], categories: ["Breakfast", "Lunch", "Bakery"] },
  { match: ["grant's bakery", "grants bakery"], categories: ["Lunch", "Bakery"] },
  { match: ["mancini's italian deli", "mancinis italian deli"], categories: ["Lunch", "Dinner"] },
  { match: ["labadie's bakery", "labadies bakery"], categories: ["Breakfast", "Bakery"] },
  { match: ["bakery barn"], categories: ["Bakery"] },
  { match: ["the maine grill", "maine grill"], categories: ["Dinner"] },
  { match: ["davinci", "da vinci"], categories: ["Lunch", "Dinner", "Pizza"] },
  { match: ["the village inn", "village inn"], categories: ["Lunch", "Dinner"] },
  { match: ["new lewiston mandarin", "mandarin buffet", "mandarin"], categories: ["Lunch", "Dinner", "World Food"] }
];

function inferLocalCategories(restaurant) {
  const name = String(restaurant?.name || "").trim().toLowerCase();

  const override = LOCAL_CATEGORY_OVERRIDES.find(entry =>
    entry.match.some(term => name.includes(term))
  );

  if (override) {
    return override.categories.filter(category =>
      RESTAURANT_CATEGORY_TABS.includes(category)
    );
  }

  const categories = new Set(["Lunch", "Dinner"]);

  if (LOCAL_BREAKFAST_NAME_HINTS.some(hint => name.includes(hint))) {
    categories.add("Breakfast");
  }

  if (LOCAL_BAKERY_NAME_HINTS.some(hint => name.includes(hint))) {
    categories.add("Bakery");
  }

  if (LOCAL_PIZZA_NAME_HINTS.some(hint => name.includes(hint))) {
    categories.add("Pizza");
  }

  if (LOCAL_WORLD_FOOD_NAME_HINTS.some(hint => name.includes(hint))) {
    categories.add("World Food");
  }

  return RESTAURANT_CATEGORY_TABS.filter(category => categories.has(category));
}

function restaurantMatchesSearch(restaurant, search) {
  if (!search) return true;

  const haystack = [
    restaurant?.name,
    restaurant?.brand,
    restaurant?.city,
    restaurant?.state,
    restaurant?.pickupAddress
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function renderRestaurants() {
  const list = document.getElementById("restaurantList");
  if (!list) return;

  const search = String(
    document.getElementById("restaurantSearch")?.value || ""
  )
    .trim()
    .toLowerCase();

  const localMatches = restaurants.filter(restaurant => {
    return (
      inferLocalCategories(restaurant).includes(selectedCategory) &&
      restaurantMatchesSearch(restaurant, search)
    );
  });

  const corporateMatches = corporateRestaurants.filter(restaurant => {
    const mealPeriods = Array.isArray(restaurant.mealPeriods)
      ? restaurant.mealPeriods
      : [];
    const primaryCategory = String(restaurant.primaryCategory || "").trim();

    return (
      (mealPeriods.includes(selectedCategory) ||
        primaryCategory === selectedCategory) &&
      restaurantMatchesSearch(restaurant, search)
    );
  });

  list.innerHTML = "";

  const tabs = document.createElement("div");
  tabs.className = "restaurant-meal-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute(
    "aria-label",
    "Restaurant categories: Breakfast, Lunch, Dinner, Bakery, Pizza, World Food"
  );

  RESTAURANT_CATEGORY_TABS.forEach(meal => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "restaurant-meal-tab" + (meal === selectedCategory ? " active" : "");
    button.textContent = meal;
    button.dataset.meal = meal;
    button.setAttribute("role", "tab");
    button.setAttribute(
      "aria-selected",
      meal === selectedCategory ? "true" : "false"
    );

    button.addEventListener("click", () => {
      selectedCategory = meal;
      renderRestaurants();
    });

    tabs.appendChild(button);
  });

  list.appendChild(tabs);

  const summary = document.createElement("div");
  summary.className = "unified-meal-summary";
  summary.innerHTML = `
    <div>
      <span class="corporate-category-kicker">Courier Eats Restaurants</span>
      <h3>${escapeHTML(selectedCategory)}</h3>
    </div>
    <span class="corporate-category-count">
      ${localMatches.length + corporateMatches.length}
      ${localMatches.length + corporateMatches.length === 1
        ? "restaurant"
        : "restaurants"}
    </span>
  `;
  list.appendChild(summary);

  if (
    localMatches.length === 0 &&
    corporateMatches.length === 0 &&
    !localRestaurantsLoadError &&
    !corporateRestaurantsLoadError
  ) {
    list.insertAdjacentHTML(
      "beforeend",
      '<div class="message">No restaurants found in this meal tab.</div>'
    );
    return;
  }

  if (localMatches.length > 0) {
    const localSection = document.createElement("section");
    localSection.className = "restaurant-source-group";
    localSection.innerHTML = `
      <div class="restaurant-source-heading">
        <div>
          <span class="restaurant-source-kicker">Order on Courier Eats</span>
          <h4>Local Restaurants</h4>
        </div>
        <span>${localMatches.length}</span>
      </div>
    `;

    const localGrid = document.createElement("div");
    localGrid.className = "restaurant-grid unified-local-grid";
    localMatches.forEach(restaurant => {
      localGrid.appendChild(createLocalRestaurantCard(restaurant));
    });

    localSection.appendChild(localGrid);
    list.appendChild(localSection);
  } else if (localRestaurantsLoadError) {
    list.insertAdjacentHTML(
      "beforeend",
      `<div class="message">Local restaurants: ${escapeHTML(localRestaurantsLoadError)}</div>`
    );
  }

  if (corporateMatches.length > 0) {
    const corporateSection = document.createElement("section");
    corporateSection.className = "restaurant-source-group";
    corporateSection.innerHTML = `
      <div class="restaurant-source-heading">
        <div>
          <span class="restaurant-source-kicker">Order from the restaurant first</span>
          <h4>Order Direct + Courier Eats Delivery</h4>
        </div>
        <span>${corporateMatches.length}</span>
      </div>
    `;

    const corporateGrid = document.createElement("div");
    corporateGrid.className = "corporate-restaurant-grid";
    corporateMatches.forEach(restaurant => {
      corporateGrid.appendChild(createCorporateRestaurantCard(restaurant));
    });

    corporateSection.appendChild(corporateGrid);
    list.appendChild(corporateSection);
  } else if (corporateRestaurantsLoadError) {
    list.insertAdjacentHTML(
      "beforeend",
      `<div class="message">Order Direct restaurants: ${escapeHTML(corporateRestaurantsLoadError)}</div>`
    );
  }
}

function createLocalRestaurantCard(restaurant) {
  const card = document.createElement("article");
  const brand = localBrandPresentation(restaurant);

  card.className = "restaurant-card local-restaurant-card";
  card.style.setProperty("--local-accent", brand.accent);
  card.style.setProperty("--local-accent-2", brand.accent2);
  card.style.setProperty("--local-soft", brand.soft);

  const locationText = [restaurant.city, restaurant.state]
    .filter(Boolean)
    .join(", ");

  const periods = inferLocalCategories(restaurant);
  const onlineOrder = localOnlineOrderFor(restaurant);

  card.innerHTML = `
    <div class="local-brand-strip" aria-hidden="true"></div>
    <div class="restaurant-top">
      <div class="local-card-heading">
        <div class="local-logo-wrap">
          ${brand.logoUrl
            ? `<img
                 class="local-brand-logo"
                 src="${escapeHTML(brand.logoUrl)}"
                 alt="${escapeHTML((restaurant.name || "Local restaurant") + " logo")}"
                 loading="lazy"
                 referrerpolicy="no-referrer"
               >`
            : ""}
          <span class="local-brand-fallback" ${brand.logoUrl ? "hidden" : ""}>
            ${escapeHTML(brand.initials)}
          </span>
        </div>
        <div class="local-card-title">
          <div class="local-card-badges">
            <span class="local-restaurant-badge">Local Restaurant</span>
            <span class="local-meal-badge">${escapeHTML(periods.join(" • "))}</span>
            ${onlineOrder
              ? '<span class="local-online-badge">Online Ordering</span>'
              : ""}
          </div>
          <h3 class="restaurant-name">${escapeHTML(restaurant.name || "")}</h3>
          <div class="restaurant-location">${escapeHTML(locationText)}</div>
        </div>
      </div>

      <div class="local-order-actions">
        <button class="view-menu" type="button">
          View ${escapeHTML(selectedCategory)} Menu
        </button>
        ${onlineOrder
          ? `<a
               class="local-online-order"
               href="${escapeHTML(onlineOrder.url)}"
               target="_blank"
               rel="noopener noreferrer"
             >${escapeHTML(onlineOrder.label || "Order Online")}</a>`
          : ""}
      </div>
    </div>
    <div class="restaurant-menu"></div>
  `;

  const logo = card.querySelector(".local-brand-logo");
  const fallback = card.querySelector(".local-brand-fallback");
  if (logo && fallback) {
    logo.addEventListener("error", () => {
      logo.hidden = true;
      fallback.hidden = false;
    });
  }

  const button = card.querySelector(".view-menu");
  button.addEventListener("click", () => {
    loadMenu(restaurant, button);
  });

  return card;
}

function createCorporateRestaurantCard(restaurant) {
  const card = document.createElement("article");
  const brandPresentation = corporateBrandPresentation(restaurant);
  card.className =
    "corporate-restaurant-card corporate-brand-" + brandPresentation.key;

  card.innerHTML = `
    <div class="corporate-brand-strip" aria-hidden="true"></div>
    <div class="corporate-card-header">
      <div class="corporate-identity">
        <div class="corporate-logo-wrap">
          <img
            class="corporate-brand-logo"
            src="${escapeHTML(brandPresentation.logoUrl)}"
            alt="${escapeHTML((restaurant.brand || restaurant.name || "Restaurant") + " logo")}"
            loading="lazy"
            referrerpolicy="no-referrer"
          >
          <span class="corporate-brand-fallback" hidden>
            ${escapeHTML(brandPresentation.initials)}
          </span>
        </div>
        <div>
          <div class="corporate-brand">${escapeHTML(restaurant.brand || "Corporate Restaurant")}</div>
          <h3>${escapeHTML(restaurant.name || "")}</h3>
          <p>${escapeHTML(restaurant.pickupAddress || "")}</p>
        </div>
      </div>
      <div class="corporate-card-badges">
        <span class="restaurant-category-badge">
          ${escapeHTML(
            Array.isArray(restaurant.mealPeriods)
              ? restaurant.mealPeriods.join(" • ")
              : "Restaurant"
          )}
        </span>
        <span class="delivery-link-badge">Delivery-Link</span>
        <span class="independent-delivery-badge">Independent delivery</span>
      </div>
    </div>

    <div class="corporate-steps">
      <span><strong>1.</strong> Order and pay the restaurant directly.</span>
      <span><strong>2.</strong> Enter the restaurant order number below.</span>
      <span><strong>3.</strong> Pay Courier Eats separately for delivery through Square.</span>
    </div>

    <div class="corporate-actions">
      <a class="corporate-order-button" href="${escapeHTML(restaurant.orderUrl || "#")}" target="_blank" rel="noopener noreferrer">
        Order Direct
      </a>
      <button
        class="corporate-delivery-toggle"
        type="button"
        ${restaurant.deliveryQuoteEnabled ? "" : "disabled"}
      >
        ${restaurant.deliveryQuoteEnabled
          ? "I Already Ordered — Get Delivery"
          : "Courier Eats Delivery Pricing Temporarily Unavailable"}
      </button>
    </div>

    <form class="corporate-delivery-form" hidden>
      <label>
        Restaurant order number
        <input name="restaurantOrderId" autocomplete="off" required>
      </label>
      <label>
        Your name
        <input name="customerName" autocomplete="name" required>
      </label>
      <label>
        Phone number
        <input name="customerPhone" type="tel" autocomplete="tel" required>
      </label>
      <label class="corporate-form-wide">
        Delivery address
        <input name="deliveryAddress" placeholder="Street, city, state" autocomplete="street-address" required>
      </label>
      <label>
        Delivery ZIP
        <input name="deliveryPostalCode" inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" placeholder="04240" required>
      </label>
      <button class="corporate-quote-button" type="submit">Get Delivery Price</button>
      <div class="corporate-delivery-message" aria-live="polite"></div>
    </form>

    <p class="corporate-independent-note">
      Courier Eats / Lewiston Courier Service is an independent delivery service and is not affiliated with ${escapeHTML(restaurant.brand || restaurant.name || "this restaurant")}.
    </p>
  `;

  const logo = card.querySelector(".corporate-brand-logo");
  const logoFallback = card.querySelector(".corporate-brand-fallback");
  if (logo && logoFallback) {
    logo.addEventListener("error", () => {
      logo.hidden = true;
      logoFallback.hidden = false;
    });
  }

  const toggle = card.querySelector(".corporate-delivery-toggle");
  const form = card.querySelector(".corporate-delivery-form");

  if (restaurant.deliveryQuoteEnabled) {
    toggle.addEventListener("click", () => {
      form.hidden = !form.hidden;
      toggle.textContent = form.hidden
        ? "I Already Ordered — Get Delivery"
        : "Hide Delivery Form";
    });

    form.addEventListener("submit", event => {
      submitCorporateDelivery(event, restaurant);
    });
  } else {
    form.hidden = true;
    toggle.title = "Uber Direct account enablement is still pending.";
  }

  return card;
}

async function submitCorporateDelivery(event, restaurant) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector(".corporate-quote-button");
  const message = form.querySelector(".corporate-delivery-message");
  const formData = new FormData(form);

  button.disabled = true;
  button.textContent = "Checking delivery price...";
  message.className = "corporate-delivery-message";
  message.textContent = "";

  try {
    let dispatchOrderId = 0;

    const createResponse = await fetch("/api/corporate/delivery-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: restaurant.id,
        restaurantOrderId: formData.get("restaurantOrderId"),
        customerName: formData.get("customerName"),
        customerPhone: formData.get("customerPhone"),
        deliveryAddress: formData.get("deliveryAddress"),
        deliveryPostalCode: formData.get("deliveryPostalCode")
      })
    });

    const createData = await createResponse.json();

    if (createResponse.ok) {
      dispatchOrderId = Number(createData.dispatchOrderId || 0);
    } else if (
      createResponse.status === 409 &&
      createData.dispatchOrderId &&
      createData.status === "AWAITING_DELIVERY_PAYMENT"
    ) {
      dispatchOrderId = Number(createData.dispatchOrderId);
    } else {
      throw new Error(createData.error || "Unable to start the delivery request.");
    }

    const quoteResponse = await fetch("/api/uber-direct/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dispatchOrderId })
    });
    const quoteData = await quoteResponse.json();

    if (!quoteResponse.ok) {
      const detail =
        quoteData?.metadata?.param_details ||
        quoteData?.details?.metadata?.param_details ||
        quoteData?.message ||
        quoteData?.error ||
        "Delivery pricing is temporarily unavailable.";
      throw new Error(typeof detail === "string" ? detail : "Delivery pricing is temporarily unavailable.");
    }

    const price = quoteData.customerPrice || money(quoteData.customerPriceCents);

    message.className = "corporate-delivery-message success";
    message.innerHTML = `
      <strong>Courier Eats delivery: ${escapeHTML(price)}</strong>
      <span>Restaurant food is paid separately to the restaurant.</span>
    `;

    const payButton = document.createElement("button");
    payButton.type = "button";
    payButton.className = "corporate-pay-button";
    payButton.textContent = "Pay " + price + " Delivery with Square";
    payButton.addEventListener("click", async () => {
      payButton.disabled = true;
      payButton.textContent = "Opening Square...";

      try {
        const paymentResponse = await fetch("/api/corporate/delivery-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatchOrderId })
        });
        const paymentData = await paymentResponse.json();

        if (!paymentResponse.ok || !paymentData.checkoutUrl) {
          throw new Error(
            paymentData.error ||
            paymentData.message ||
            "Square checkout could not be created."
          );
        }

        window.location.href = paymentData.checkoutUrl;
      } catch (error) {
        message.className = "corporate-delivery-message error";
        message.textContent = error.message;
        payButton.disabled = false;
        payButton.textContent = "Try Square Checkout Again";
      }
    });

    message.appendChild(payButton);
    button.textContent = "Price Ready";
  } catch (error) {
    console.error(error);
    message.className = "corporate-delivery-message error";
    message.textContent = error.message;
    button.disabled = false;
    button.textContent = "Try Delivery Price Again";
  }
}

async function loadRestaurants() {
  try {
    const response = await fetch("/api/restaurants", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Restaurant API returned " + response.status);
    }

    const data = await response.json();
    restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
    localRestaurantsLoadError = "";
  } catch (error) {
    console.error(error);
    restaurants = [];
    localRestaurantsLoadError = error.message || "Unable to load local restaurants.";
  }

  renderRestaurants();
}

async function loadMenu(
restaurant,
button
) {
const card =
button.closest(
".restaurant-card"
);
const menuBox =
card.querySelector(
".restaurant-menu"
);
if (
menuBox.dataset.loaded === "true"
) {
const isHidden =
menuBox.style.display ===
"none";
menuBox.style.display =
isHidden
? "block"
: "none";
button.textContent =
isHidden
? "Hide Menu"
: "View Menu";
return;
}
menuBox.style.display =
"block";
menuBox.innerHTML = `
<div class="message">
Loading menu...
</div>
`;
try {
const response =
await fetch(
"/api/menu?location=" +
encodeURIComponent(
restaurant.locationId
),
{
cache: "no-store"
}
);
if (!response.ok) {
throw new Error(
"Menu API returned " +
response.status
);
}
const data =
await response.json();
let items =
Array.isArray(
data.items
)
? data.items
: [];
if (
selectedCategory !== "All"
) {
const category =
selectedCategory
.toLowerCase();
items =
items.filter(
item => {
const courierCategory =
String(
item.courierCategory ||
""
)
.toLowerCase();
const squareCategories =
Array.isArray(
item.squareCategories
)
? item.squareCategories
.join(" ")
.toLowerCase()
: "";
const name =
String(
item.name || ""
)
.toLowerCase();
return (
courierCategory.includes(
category
) ||
squareCategories.includes(
category
) ||
name.includes(
category
)
);
}
);
}
menuBox.innerHTML = "";
if (
items.length === 0
) {
menuBox.innerHTML = `
<div class="message">
No menu items found for
${escapeHTML(
selectedCategory
)}.
</div>
`;
return;
}
items.forEach(
item => {
const itemBox =
document.createElement(
"div"
);
itemBox.className =
"menu-item";
if (
item.courierCategory
) {
const categoryLabel =
document.createElement(
"div"
);
categoryLabel.className =
"menu-category";
categoryLabel.textContent =
item.courierCategory;
itemBox.appendChild(
categoryLabel
);
}
const name =
document.createElement(
"div"
);
name.className =
"menu-item-name";
name.textContent =
item.name || "";
itemBox.appendChild(name);
if (
item.description
) {
const description =
document.createElement(
"p"
);
description.className =
"menu-description";
description.textContent =
item.description;
itemBox.appendChild(
description
);
}
const variations =
Array.isArray(
item.variations
)
? item.variations
: [];
variations.forEach(
variation => {
const row =
document.createElement(
"div"
);
row.className =
"variation-row";
const info =
document.createElement(
"div"
);
info.className =
"variation-info";
const variationName =
document.createElement(
"span"
);
variationName.textContent =
variation.name ||
item.name ||
"";
const price =
document.createElement(
"span"
);
price.className =
"variation-price";
price.textContent =
money(
variation.price
);
info.appendChild(
variationName
);
info.appendChild(
price
);
const addButton =
document.createElement(
"button"
);
addButton.type =
"button";
addButton.className =
"add-cart";
addButton.textContent =
"Add";
addButton.addEventListener(
"click",
() => {
addToCart({
itemName:
item.name || "",
variationName:
variation.name ||
"",
price:
variation.price,
variationId:
variation.id,
locationId:
restaurant.locationId,
restaurantName:
restaurant.name
});
}
);
row.appendChild(info);
row.appendChild(
addButton
);
itemBox.appendChild(row);
}
);
menuBox.appendChild(
itemBox
);
}
);
menuBox.dataset.loaded =
"true";
button.textContent =
"Hide Menu";
} catch (error) {
console.error(error);
menuBox.innerHTML = `
<div class="message">
Unable to load menu:
${escapeHTML(
error.message
)}
</div>
`;
}
}
function addToCart(item) {
if (
!item.variationId
) {
alert(
"This menu item cannot be ordered yet because its Square variation ID is missing."
);
return;
}
if (
cartLocationId &&
cartLocationId !==
item.locationId
) {
alert(
"Your cart already contains items from another restaurant. Please checkout or clear that restaurant before ordering from a different restaurant."
);
return;
}
cartLocationId =
item.locationId;
cartRestaurantName =
item.restaurantName || "";
const existing =
cart.find(
cartItem =>
cartItem.variationId ===
item.variationId
);
if (existing) {
existing.quantity += 1;
} else {
cart.push({
itemName:
item.itemName,
variationName:
item.variationName,
variationId:
item.variationId,
price:
item.price,
quantity: 1
});
}
updateCartUI();
}
function updateCartUI() {
const quantity =
cart.reduce(
(total, item) =>
total +
item.quantity,
0
);
document
.getElementById(
"cartButton"
)
.textContent =
"Cart (" +
quantity +
")";
const restaurantBox =
document.getElementById(
"cartRestaurant"
);
restaurantBox.textContent =
cartRestaurantName
? "Restaurant: " +
cartRestaurantName
: "";
const cartItems =
document.getElementById(
"cartItems"
);
cartItems.innerHTML = "";
let total = 0;
if (
cart.length === 0
) {
cartItems.innerHTML = `
<div class="message">
Your cart is empty.
</div>
`;
}
cart.forEach(
item => {
const price =
Number(
item.price || 0
);
total +=
price *
item.quantity;
const box =
document.createElement(
"div"
);
box.className =
"cart-item";
const title =
document.createElement(
"div"
);
title.className =
"cart-item-name";
title.textContent =
item.itemName +
(
item.variationName
? " - " +
item.variationName
: ""
);
const controls =
document.createElement(
"div"
);
controls.className =
"cart-item-controls";
const quantityControls =
document.createElement(
"div"
);
quantityControls.className =
"quantity-controls";
const minus =
document.createElement(
"button"
);
minus.className =
"quantity-button";
minus.textContent =
"−";
minus.addEventListener(
"click",
() => {
changeQuantity(
item.variationId,
-1
);
}
);
const quantityText =
document.createElement(
"span"
);
quantityText.textContent =
item.quantity;
const plus =
document.createElement(
"button"
);
plus.className =
"quantity-button";
plus.textContent =
"+";
plus.addEventListener(
"click",
() => {
changeQuantity(
item.variationId,
1
);
}
);
quantityControls.appendChild(
minus
);
quantityControls.appendChild(
quantityText
);
quantityControls.appendChild(
plus
);
const right =
document.createElement(
"div"
);
const priceText =
document.createElement(
"strong"
);
priceText.textContent =
money(
price *
item.quantity
);
const remove =
document.createElement(
"button"
);
remove.className =
"remove-button";
remove.textContent =
" Remove";
remove.addEventListener(
"click",
() => {
removeItem(
item.variationId
);
}
);
right.appendChild(
priceText
);
right.appendChild(
remove
);
controls.appendChild(
quantityControls
);
controls.appendChild(
right
);
box.appendChild(title);
box.appendChild(
controls
);
cartItems.appendChild(
box
);
}
);
document
.getElementById(
"cartTotal"
)
.textContent =
money(total);
}
function changeQuantity(
variationId,
amount
) {
const item =
cart.find(
cartItem =>
cartItem.variationId ===
variationId
);
if (!item) {
return;
}
item.quantity += amount;
if (
item.quantity <= 0
) {
removeItem(
variationId
);
return;
}
updateCartUI();
}
function removeItem(
variationId
) {
cart =
cart.filter(
item =>
item.variationId !==
variationId
);
if (
cart.length === 0
) {
cartLocationId =
null;
cartRestaurantName =
"";
}
updateCartUI();
}
async function checkoutCart() {
if (
cart.length === 0
) {
alert(
"Your Courier Eats cart is empty."
);
return;
}
const checkoutButton =
document.getElementById(
"checkoutButton"
);
checkoutButton.disabled =
true;
checkoutButton.textContent =
"Opening Square checkout...";
try {
const response =
await fetch(
"/api/checkout",
{
method: "POST",
headers: {
"Content-Type":
"application/json"
},
body:
JSON.stringify({
locationId:
cartLocationId,
items:
cart.map(
item => ({
variationId:
item.variationId,
quantity:
item.quantity
})
)
})
}
);
const data =
await response.json();
if (!response.ok) {
throw new Error(
data.message ||
data.error ||
"Checkout failed"
);
}
if (
!data.checkoutUrl
) {
throw new Error(
"Square did not return a checkout URL."
);
}
window.location.href =
data.checkoutUrl;
} catch (error) {
console.error(error);
alert(
"Unable to start checkout: " +
error.message
);
checkoutButton.disabled =
false;
checkoutButton.textContent =
"Checkout with Square";
}
}
document
.getElementById(
"restaurantSearch"
)
.addEventListener(
"input",
renderRestaurants
);
document
.getElementById(
"cartButton"
)
.addEventListener(
"click",
() => {
updateCartUI();
document
.getElementById(
"cartOverlay"
)
.style.display =
"block";
}
);
document
.getElementById(
"cartClose"
)
.addEventListener(
"click",
() => {
document
.getElementById(
"cartOverlay"
)
.style.display =
"none";
}
);
document
.getElementById(
"checkoutButton"
)
.addEventListener(
"click",
checkoutCart
);
const params =
new URLSearchParams(
window.location.search
);
if (
params.get("order") ===
"complete"
) {
document
.getElementById(
"orderComplete"
)
.style.display =
"block";
}
loadCorporateRestaurants();
loadRestaurants();
updateCartUI();
