const BREAKFAST_CARD_META = {
  "happy days diner": { background:"#C73A3A", text:"#FFFFFF", accent:"#F7D8A8", accentText:"#222222", bird:"Black-capped Chickadee", birdGlyph:"🐦" },
  "rolly's diner": { background:"#295A9F", text:"#FFFFFF", accent:"#E6EEF8", accentText:"#1A1A1A", bird:"Blue Jay", birdGlyph:"🐦" },
  "fran's restaurant": { background:"#B63C3C", text:"#FFFFFF", accent:"#F4E7D3", accentText:"#222222", bird:"Northern Cardinal", birdGlyph:"🐦" },
  "roy's all steak hamburgers": { background:"#7B1E1E", text:"#FFFFFF", accent:"#D9B45B", accentText:"#1A1A1A", bird:"Bald Eagle", birdGlyph:"🦅" },
  "station grill restaurant": { background:"#3A3A3A", text:"#FFFFFF", accent:"#C84141", accentText:"#FFFFFF", bird:"Herring Gull", birdGlyph:"🐦" },
  "kristi's cafe": { background:"#7A5A3A", text:"#FFFFFF", accent:"#F4E2C6", accentText:"#222222", bird:"American Goldfinch", birdGlyph:"🐦" },
  "dubois cafe": { background:"#6E2F3B", text:"#FFFFFF", accent:"#E7D8D8", accentText:"#222222", bird:"Mourning Dove", birdGlyph:"🕊️" },
  "forage market": { background:"#4C6A47", text:"#FFFFFF", accent:"#D9C9A2", accentText:"#222222", bird:"Black-capped Chickadee", birdGlyph:"🐦" },
  "governor's restaurant & bakery": { background:"#244A86", text:"#FFFFFF", accent:"#F1F3F8", accentText:"#1A1A1A", bird:"Common Loon", birdGlyph:"🐦" },
  "the italian bakery": { background:"#B22222", text:"#FFFFFF", accent:"#2E8B57", accentText:"#FFFFFF", bird:"Northern Cardinal", birdGlyph:"🐦" },
  "the cupcakery cafe & bake shop": { background:"#D97BAA", text:"#FFFFFF", accent:"#FFF0F6", accentText:"#7A2A4A", bird:"American Goldfinch", birdGlyph:"🐦" },
  "georgio's pizza & donut shop": { background:"#B3261E", text:"#FFFFFF", accent:"#F0C541", accentText:"#222222", bird:"Blue Jay", birdGlyph:"🐦" }
};

function normalizeRestaurantKey(value) {
  return String(value || "").trim().toLowerCase();
}

function restaurantInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

let restaurants = [];
let selectedCategory = "All";
let cart = [];

function breakfastIsOpen() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const hour = Number(parts.find(part => part.type === "hour")?.value || 0);
  const minute = Number(parts.find(part => part.type === "minute")?.value || 0);
  const now = hour * 60 + minute;
  return now >= 6 * 60 && now < 11 * 60;
}

function updateBreakfastAvailability() {
  const open = breakfastIsOpen();
  const button = document.querySelector('.category-button[data-category="Breakfast"]');
  if (!button) return;

  button.disabled = !open;
  button.classList.toggle("closed", !open);
  button.setAttribute("aria-disabled", String(!open));
  button.title = open
    ? "Breakfast available now"
    : "Breakfast available 6:00 AM–11:00 AM Eastern";

  const label = button.querySelector(".breakfast-hours-label");
  if (label) {
    label.textContent = open ? "Open" : "Closed";
  }

  if (!open && selectedCategory === "Breakfast") {
    selectedCategory = "All";
    button.classList.remove("active");
    document.querySelector('.category-button[data-category="All"]')?.classList.add("active");
    document.getElementById("restaurantService")?.classList.remove("breakfast-mode");
    document.querySelector(".hero")?.classList.remove("breakfast-selected");
    renderRestaurants();
  }
}
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
const nameMatch =
String(
restaurant.name || ""
)
.toLowerCase()
.includes(search);

const categoryMatch =
selectedCategory === "All" ||
(
Array.isArray(restaurant.categories) &&
restaurant.categories.some(category =>
String(category).toLowerCase() ===
selectedCategory.toLowerCase()
)
);

return nameMatch && categoryMatch;
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

const meta =
BREAKFAST_CARD_META[
normalizeRestaurantKey(
restaurant.name
)
] || null;

if (
selectedCategory === "Breakfast" &&
meta
) {
card.classList.add(
"breakfast-card"
);
card.style.setProperty(
"--card-bg",
meta.background
);
card.style.setProperty(
"--card-text",
meta.text
);
card.style.setProperty(
"--card-accent",
meta.accent
);
card.style.setProperty(
"--card-accent-text",
meta.accentText
);
}

const locationText =
[
restaurant.city,
restaurant.state
]
.filter(Boolean)
.join(", ");

const categories =
Array.isArray(
restaurant.categories
)
? restaurant.categories
: [];

const categoryTags =
categories
.map(category =>
`<span class="restaurant-tag">${escapeHTML(category)}</span>`
)
.join("");

const logoMarkup =
restaurant.logoUrl
? `
<img
class="restaurant-logo-image"
src="${escapeHTML(restaurant.logoUrl)}"
alt="${escapeHTML(restaurant.name)} logo"
onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
/>
<div class="restaurant-logo-fallback" style="display:none">
${escapeHTML(restaurantInitials(restaurant.name))}
</div>
`
: `
<div class="restaurant-logo-fallback">
${escapeHTML(restaurantInitials(restaurant.name))}
</div>
`;

const birdMarkup =
meta
? `
<div
class="card-bird"
title="${escapeHTML(meta.bird)}"
aria-label="${escapeHTML(meta.bird)}"
>
<span aria-hidden="true">${meta.birdGlyph}</span>
</div>
`
: "";

const externalOrder =
!restaurant.checkoutEnabled &&
restaurant.orderUrl;

const primaryButton =
restaurant.locationId
? `
<button
class="view-menu"
type="button"
>
View Menu
</button>
`
: restaurant.menuUrl
? `
<a
class="view-menu restaurant-link"
href="${escapeHTML(restaurant.menuUrl)}"
target="_blank"
rel="noopener noreferrer"
>
View Menu
</a>
`
: "";

const orderButton =
externalOrder
? `
<a
class="order-now restaurant-link"
href="${escapeHTML(restaurant.orderUrl)}"
target="_blank"
rel="noopener noreferrer"
>
Order Now
</a>
`
: (
!restaurant.locationId &&
restaurant.phone
? `
<a
class="order-now restaurant-link"
href="tel:${escapeHTML(restaurant.phone)}"
>
Call to Order
</a>
`
: ""
);

card.innerHTML = `
${birdMarkup}
<div class="restaurant-top">
<div class="restaurant-logo-wrap">
${logoMarkup}
</div>
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
<div class="restaurant-tags">
${categoryTags}
</div>
<div class="restaurant-actions">
${primaryButton}
${orderButton}
</div>
</div>
<div
class="restaurant-menu"
></div>
`;

const button =
card.querySelector(
"button.view-menu"
);

if (button) {
button.addEventListener(
"click",
() => {
card.classList.add("selected");
loadMenu(
restaurant,
button
);
}
);
}

card.addEventListener(
"mouseenter",
() => card.classList.add("bird-visible")
);

card.addEventListener(
"mouseleave",
() => {
if (!card.classList.contains("selected")) {
card.classList.remove("bird-visible");
}
}
);

card.addEventListener(
"click",
event => {
if (
event.target.closest(
"a, button, .restaurant-menu"
)
) {
return;
}
document
.querySelectorAll(
".restaurant-card.selected"
)
.forEach(other => {
if (other !== card) {
other.classList.remove(
"selected",
"bird-visible"
);
}
});
card.classList.toggle(
"selected"
);
card.classList.toggle(
"bird-visible",
card.classList.contains("selected")
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
const topCount =
document.querySelector(
"#cartTopButton span"
);
if (topCount) {
topCount.textContent =
String(quantity);
}
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
if (
button.dataset.category === "Breakfast" &&
!breakfastIsOpen()
) {
updateBreakfastAvailability();
return;
}
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

const restaurantService =
document.getElementById(
"restaurantService"
);
restaurantService.classList.toggle(
"breakfast-mode",
selectedCategory === "Breakfast"
);
document
.querySelector(
".hero"
)
?.classList.toggle(
"breakfast-selected",
selectedCategory === "Breakfast"
);

renderRestaurants();
if (selectedCategory !== "All") {
restaurantService?.scrollIntoView({ behavior: "smooth", block: "start" });
}
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
window.dispatchEvent(
new CustomEvent(
"couriereats:task-complete"
)
);
}
loadRestaurants();
updateCartUI();
updateBreakfastAvailability();
setInterval(updateBreakfastAvailability, 60 * 1000);
