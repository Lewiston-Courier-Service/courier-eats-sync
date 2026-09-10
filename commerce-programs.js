const GIFT_CARD_ROUTE = "/gift-cards";
const MEMBERSHIP_ROUTE = "/membership";
const MERCHANT_PLANS_ROUTE = "/merchant-plans";
const PLANS_ROUTE = "/api/commerce/plans";
const SUBSCRIPTION_CHECKOUT_ROUTE = "/api/commerce/subscription-checkout";

const CUSTOMER_PLANS = Object.freeze([
  {
    code: "LOCAL_PASS",
    name: "Courier Eats Local Pass",
    priceCents: 799,
    cadence: "MONTHLY",
    audience: "CUSTOMER",
    description: "A lower-cost local delivery membership designed for regular Courier Eats customers.",
    benefits: [
      "$1.50 off eligible Courier Eats delivery fees",
      "No Courier Eats pickup service fee on eligible pickup orders",
      "Member-only local restaurant promotions",
      "Mileage and special handling charges still apply when applicable"
    ],
    envPlanId: "SQUARE_SUB_PLAN_LOCAL_PASS"
  }
]);

const MERCHANT_PLANS = Object.freeze([
  {
    code: "LOCAL_CONNECT",
    name: "Courier Eats Local Connect",
    priceCents: 4900,
    cadence: "MONTHLY",
    audience: "MERCHANT",
    description: "Core local restaurant connection plan with 0% Courier Eats commission unless a separate written agreement says otherwise.",
    benefits: [
      "Courier Eats restaurant listing and ordering connection",
      "Square/POS connection support",
      "Google Business Profile order-link setup",
      "Facebook and Instagram ordering-link setup",
      "Cash App / Square ordering connection support",
      "Menu and hours sync support",
      "Standard order routing and support"
    ],
    envPlanId: "SQUARE_SUB_PLAN_LOCAL_CONNECT"
  },
  {
    code: "LOCAL_PRO",
    name: "Courier Eats Local Pro",
    priceCents: 7900,
    cadence: "MONTHLY",
    audience: "MERCHANT",
    description: "Higher-touch local restaurant plan for more complex menus, channels, locations, or catering operations.",
    benefits: [
      "Everything in Local Connect",
      "Priority menu and channel updates",
      "Multi-location support",
      "Catering configuration and delivery-pricing support",
      "Enhanced reporting and operational review",
      "Priority integration support"
    ],
    envPlanId: "SQUARE_SUB_PLAN_LOCAL_PRO"
  }
]);

export async function handleCommercePrograms(request, env) {
  const url = new URL(request.url);
  const routes = new Set([
    GIFT_CARD_ROUTE,
    MEMBERSHIP_ROUTE,
    MERCHANT_PLANS_ROUTE,
    PLANS_ROUTE,
    SUBSCRIPTION_CHECKOUT_ROUTE
  ]);

  if (!routes.has(url.pathname)) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store"
      }
    });
  }

  if (request.method === "GET") {
    if (url.pathname === GIFT_CARD_ROUTE) return html(giftCardPage(env));
    if (url.pathname === MEMBERSHIP_ROUTE) return html(membershipPage(env));
    if (url.pathname === MERCHANT_PLANS_ROUTE) return html(merchantPlansPage(env));
    if (url.pathname === PLANS_ROUTE) return json({
      success: true,
      customerPlans: publicPlans(CUSTOMER_PLANS, env),
      merchantPlans: publicPlans(MERCHANT_PLANS, env),
      corporate: {
        code: "CORPORATE_CUSTOM",
        audience: "MERCHANT",
        pricing: "Negotiated commission and permitted menu-pricing terms; no default monthly subscription."
      },
      giftCards: {
        enabled: Boolean(clean(env.SQUARE_EGIFT_CARD_URL, 1000)),
        denominationsCents: [2500, 5000, 7500, 10000],
        customAmount: true
      }
    });
  }

  if (url.pathname === SUBSCRIPTION_CHECKOUT_ROUTE && request.method === "POST") {
    return await createSubscriptionCheckout(request, env);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function createSubscriptionCheckout(request, env) {
  if (String(env.SUBSCRIPTIONS_ENABLED || "").toLowerCase() !== "true") {
    return json({ error: "Subscription checkout is not enabled yet" }, 503);
  }
  if (!env.SQUARE_ACCESS_TOKEN) {
    return json({ error: "Square access token is not configured" }, 503);
  }
  if (!env.SQUARE_LOCATION_ID) {
    return json({ error: "Square subscription location is not configured" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Valid JSON is required" }, 400);
  }

  const code = clean(body.planCode, 80).toUpperCase();
  const plan = [...CUSTOMER_PLANS, ...MERCHANT_PLANS].find(item => item.code === code);
  if (!plan) return json({ error: "Unknown subscription plan" }, 400);

  const subscriptionPlanId = clean(env[plan.envPlanId], 255);
  if (!subscriptionPlanId) {
    return json({ error: `${plan.name} is not connected to a Square subscription plan yet` }, 503);
  }

  const squareResponse = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2026-08-19",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      description: `${plan.name} subscription`,
      quick_pay: {
        name: plan.name,
        price_money: {
          amount: plan.priceCents,
          currency: "USD"
        },
        location_id: env.SQUARE_LOCATION_ID
      },
      checkout_options: {
        subscription_plan_id: subscriptionPlanId,
        redirect_url: `${new URL(request.url).origin}${plan.audience === "MERCHANT" ? MERCHANT_PLANS_ROUTE : MEMBERSHIP_ROUTE}?subscribed=1`
      },
      payment_note: `Courier Eats subscription: ${plan.code}`
    })
  });

  const data = await safeJson(squareResponse);
  if (!squareResponse.ok) {
    return json({ error: "Unable to create Square subscription checkout", details: data }, squareResponse.status);
  }

  return json({
    success: true,
    planCode: plan.code,
    checkoutUrl: data.payment_link?.url || data.payment_link?.long_url || null,
    paymentLinkId: data.payment_link?.id || null
  }, 201);
}

function giftCardPage(env) {
  const purchaseUrl = clean(env.SQUARE_EGIFT_CARD_URL, 1000);
  return page("Courier Eats Gift Cards", `
    <div class="eyebrow">Courier Eats</div>
    <h1>Give local food & delivery</h1>
    <p class="lead">Courier Eats gift cards are intended for purchases through Courier Eats. They are not automatically redeemable directly at an independent restaurant's own register unless that restaurant and checkout are part of the same Square gift-card program.</p>

    <div class="amounts">
      ${[25, 50, 75, 100].map(amount => `<span>$${amount}</span>`).join("")}
      <span>Custom</span>
    </div>

    ${purchaseUrl
      ? `<p><a class="button" href="${escapeHtml(purchaseUrl)}" rel="noopener">Buy a Square eGift Card</a></p>`
      : `<div class="notice"><strong>Setup ready:</strong> add the Square-hosted eGift Card Order Site URL as <code>SQUARE_EGIFT_CARD_URL</code> before publishing this page. Until then, no gift-card purchase is offered.</div>`}

    <h2>Recommended launch rules</h2>
    <ul>
      <li>Suggested denominations: $25, $50, $75, $100, plus custom amount.</li>
      <li>No Courier Eats expiration date or inactivity fee unless required/allowed and expressly disclosed.</li>
      <li>Do not issue value until Square confirms the gift-card purchase payment.</li>
      <li>Use Square's hosted eGift flow first; custom API issuance can be added later after sandbox testing.</li>
    </ul>
  `);
}

function membershipPage(env) {
  return page("Courier Eats Membership", `
    <div class="eyebrow">Courier Eats</div>
    <h1>Local Pass</h1>
    <p class="lead">A simple membership for customers who order locally and want predictable savings without making LCS absorb the full cost of every delivery.</p>
    ${planCards(CUSTOMER_PLANS, env)}
    <p class="small">Delivery eligibility, mileage, large-order, catering, waiting-time, and other special handling charges can still apply. Membership benefits should be shown before checkout and may be revised prospectively with notice.</p>
  `);
}

function merchantPlansPage(env) {
  return page("Courier Eats Restaurant Plans", `
    <div class="eyebrow">Courier Eats for Restaurants</div>
    <h1>Local restaurant plans</h1>
    <p class="lead">Local plans keep the 0% Courier Eats commission model while charging for the technology, syncing, connection, and support work.</p>
    ${planCards(MERCHANT_PLANS, env)}
    <section class="card">
      <h2>Corporate / franchise</h2>
      <p><strong>Custom commercial agreement</strong></p>
      <p>Use negotiated commission and authorized menu-pricing terms instead of a default local monthly subscription. Delivery and mileage charges remain separately defined.</p>
    </section>
  `);
}

function planCards(plans, env) {
  const checkoutEnabled = String(env.SUBSCRIPTIONS_ENABLED || "").toLowerCase() === "true";
  return `<div class="plans">${plans.map(plan => {
    const connected = Boolean(clean(env[plan.envPlanId], 255));
    const canCheckout = checkoutEnabled && connected && env.SQUARE_LOCATION_ID && env.SQUARE_ACCESS_TOKEN;
    return `<section class="card">
      <h2>${escapeHtml(plan.name)}</h2>
      <div class="price">$${(plan.priceCents / 100).toFixed(2)}<small>/month</small></div>
      <p>${escapeHtml(plan.description)}</p>
      <ul>${plan.benefits.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${canCheckout
        ? `<button class="button" data-plan="${escapeHtml(plan.code)}">Subscribe with Square</button>`
        : `<p class="status">Checkout is staged but not activated.</p>`}
    </section>`;
  }).join("")}</div>
  <script>
  document.querySelectorAll('[data-plan]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const old = button.textContent;
      button.textContent = 'Opening Square…';
      try {
        const response = await fetch('${SUBSCRIPTION_CHECKOUT_ROUTE}', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({planCode: button.dataset.plan})
        });
        const data = await response.json();
        if (!response.ok || !data.checkoutUrl) throw new Error(data.error || 'Checkout unavailable');
        location.href = data.checkoutUrl;
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = old;
      }
    });
  });
  </script>`;
}

function publicPlans(plans, env) {
  const checkoutEnabled = String(env.SUBSCRIPTIONS_ENABLED || "").toLowerCase() === "true";
  return plans.map(plan => ({
    code: plan.code,
    name: plan.name,
    priceCents: plan.priceCents,
    cadence: plan.cadence,
    audience: plan.audience,
    description: plan.description,
    benefits: plan.benefits,
    checkoutReady: Boolean(checkoutEnabled && clean(env[plan.envPlanId], 255) && env.SQUARE_LOCATION_ID && env.SQUARE_ACCESS_TOKEN)
  }));
}

function page(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | Courier Eats</title><style>
  :root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717;background:#f5f5f5}*{box-sizing:border-box}body{margin:0}.shell{width:min(980px,calc(100% - 28px));margin:0 auto;padding:42px 0 64px}h1{font-size:clamp(2.3rem,7vw,4.4rem);line-height:.95;margin:.45rem 0 1rem}.lead{max-width:760px;font-size:1.08rem;line-height:1.65}.eyebrow{font-weight:900;letter-spacing:.06em;text-transform:uppercase}.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px;margin:24px 0}.card{background:#fff;border:1px solid #ddd;border-radius:18px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.05)}.price{font-size:2rem;font-weight:900;margin:.5rem 0}.price small{font-size:.9rem;font-weight:700;color:#666}.button{border:0;border-radius:11px;padding:12px 17px;font-weight:850;background:#171717;color:#fff;cursor:pointer;text-decoration:none;display:inline-block}.amounts{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.amounts span{background:#fff;border:1px solid #ddd;border-radius:999px;padding:10px 15px;font-weight:800}.notice{background:#fff7d6;border:1px solid #e8d37e;border-radius:12px;padding:14px;line-height:1.55}.small,.status{color:#666;font-size:.92rem;line-height:1.55}li{margin:.55rem 0;line-height:1.45}code{word-break:break-word}
  </style></head><body><main class="shell">${content}</main></body></html>`;
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: "Non-JSON response", body: text.slice(0, 800) }; }
}

function clean(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store"
    }
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type":"text/html; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Robots-Tag":"noindex, nofollow"
    }
  });
}
