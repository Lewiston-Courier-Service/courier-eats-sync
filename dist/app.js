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
loadRestaurants();
updateCartUI();
