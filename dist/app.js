let restaurants = [];
let selectedCategory = "All";
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
  const list = document.getElementById("corporateRestaurantList");
  if (!list) return;

  try {
    const response = await fetch("/api/corporate/restaurants", {
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Corporate restaurant API returned " + response.status);
    }

    const corporateRestaurants = Array.isArray(data.restaurants)
      ? data.restaurants.filter(restaurant => restaurant.deliveryEnabled !== false)
      : [];

    renderCorporateRestaurants(corporateRestaurants);
  } catch (error) {
    console.error(error);
    list.innerHTML = `
      <div class="message">
        Unable to load corporate delivery restaurants:
        ${escapeHTML(error.message)}
      </div>
    `;
  }
}

const CORPORATE_CATEGORY_ORDER = [
  "Breakfast",
  "Burgers",
  "Chicken & Wings",
  "Italian",
  "American Grill & Steak"
];

function renderCorporateRestaurants(corporateRestaurants) {
  const list = document.getElementById("corporateRestaurantList");
  if (!list) return;

  list.innerHTML = "";

  if (corporateRestaurants.length === 0) {
    list.innerHTML =
      '<div class="message">No corporate Delivery-Link restaurants are available yet.</div>';
    return;
  }

  const groups = new Map();

  corporateRestaurants.forEach(restaurant => {
    const category = String(
      restaurant.primaryCategory || "Other Restaurants"
    ).trim();

    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(restaurant);
  });

  const categories = [
    ...CORPORATE_CATEGORY_ORDER.filter(category => groups.has(category)),
    ...Array.from(groups.keys()).filter(
      category => !CORPORATE_CATEGORY_ORDER.includes(category)
    )
  ];

  categories.forEach(category => {
    const restaurantsInCategory = groups.get(category) || [];
    const section = document.createElement("section");
    section.className = "corporate-category-group";

    const heading = document.createElement("div");
    heading.className = "corporate-category-heading";
    heading.innerHTML = `
      <div>
        <span class="corporate-category-kicker">Corporate Restaurants</span>
        <h3>${escapeHTML(category)}</h3>
      </div>
      <span class="corporate-category-count">
        ${restaurantsInCategory.length}
        ${restaurantsInCategory.length === 1 ? "restaurant" : "restaurants"}
      </span>
    `;

    const grid = document.createElement("div");
    grid.className = "corporate-restaurant-grid";

    restaurantsInCategory.forEach(restaurant => {
      grid.appendChild(createCorporateRestaurantCard(restaurant));
    });

    section.appendChild(heading);
    section.appendChild(grid);
    list.appendChild(section);
  });
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
          ${escapeHTML(restaurant.primaryCategory || "Restaurant")}
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
const list =
document.getElementById(
"restaurantList"
);
try {
const response =
await fetch(
"/api/restaurants",
{
cache: "no-store"
}
);
if (!response.ok) {
throw new Error(
"Restaurant API returned " +
response.status
);
}
const data =
await response.json();
restaurants =
Array.isArray(
data.restaurants
)
? data.restaurants
: [];
renderRestaurants();
} catch (error) {
console.error(error);
list.innerHTML = `
<div class="message">
Unable to load restaurants:
${escapeHTML(
error.message
)}
</div>
`;
}
}
function renderRestaurants() {
const list =
document.getElementById(
"restaurantList"
);
const search =
document
.getElementById(
"restaurantSearch"
)
.value
.trim()
.toLowerCase();
const filtered =
restaurants.filter(
restaurant => {
return String(
restaurant.name || ""
)
.toLowerCase()
.includes(search);
}
);
list.innerHTML = "";
if (
filtered.length === 0
) {
list.innerHTML = `
<div class="message">
No restaurants found.
</div>
`;
return;
}
filtered.forEach(
restaurant => {
const card =
document.createElement(
"article"
);
card.className =
"restaurant-card";
const locationText =
[
restaurant.city,
restaurant.state
]
.filter(Boolean)
.join(", ");
card.innerHTML = `
<div class="restaurant-top">
<h3 class="restaurant-name">
${escapeHTML(
restaurant.name
)}
</h3>
<div class="restaurant-location">
${escapeHTML(
locationText
)}
</div>
<button
class="view-menu"
type="button"
>
View Menu
</button>
</div>
<div
class="restaurant-menu"
></div>
`;
const button =
card.querySelector(
".view-menu"
);
button.addEventListener(
"click",
() => {
loadMenu(
restaurant,
button
);
}
);
list.appendChild(card);
}
);
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
.querySelectorAll(
".category-button"
)
.forEach(
button => {
button.addEventListener(
"click",
() => {
document
.querySelectorAll(
".category-button"
)
.forEach(
otherButton => {
otherButton
.classList
.remove(
"active"
);
}
);
button
.classList
.add(
"active"
);
selectedCategory =
button.dataset
.category;
document
.querySelectorAll(
".restaurant-menu"
)
.forEach(
menu => {
menu.innerHTML =
"";
menu.dataset.loaded =
"false";
menu.style.display =
"none";
}
);
document
.querySelectorAll(
".view-menu"
)
.forEach(
menuButton => {
menuButton.textContent =
"View Menu";
}
);
}
);
}
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
