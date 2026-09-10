import baseWorker from "./worker.js";
import { handleDoorDashAuth } from "./doordash-auth.js";
import { handleSquareRestaurantConnector } from "./square-restaurant-connector.js";
import { handleSquareMenuSync } from "./square-menu-sync.js";
import { handleSquareSandboxWebhook } from "./square-sandbox-webhook.js";
import { applySquareLocationPricing } from "./square-location-pricing.js";
import { handleRetailPickup } from "./retail-pickup.js";
import { handleTmsAdmin } from "./tms-admin.js";
import { handlePublicTracking } from "./public-tracking.js";
import { handleDriverPod } from "./driver-pod.js";
import { handleDriverApp } from "./driver-app.js";
import { handleMarketplaceOrders } from "./marketplace-orders.js";
import { handleSquarePaymentHardening } from "./square-payment-hardening.js";

export default {
  async fetch(request, env, ctx) {
    const sandboxWebhookResponse = await handleSquareSandboxWebhook(request, env, ctx);
    if (sandboxWebhookResponse) {
      return sandboxWebhookResponse;
    }

    const paymentResponse = await handleSquarePaymentHardening(request, env, ctx);
    if (paymentResponse) {
      return paymentResponse;
    }

    const doorDashAuthResponse = await handleDoorDashAuth(request, env);
    if (doorDashAuthResponse) {
      return doorDashAuthResponse;
    }

    const marketplaceResponse = await handleMarketplaceOrders(request, env, ctx);
    if (marketplaceResponse) {
      return marketplaceResponse;
    }

    const retailResponse = await handleRetailPickup(request, env, ctx);
    if (retailResponse) {
      return retailResponse;
    }

    const tmsAdminResponse = await handleTmsAdmin(request, env, ctx);
    if (tmsAdminResponse) {
      return tmsAdminResponse;
    }

    const publicTrackingResponse = await handlePublicTracking(request, env, ctx);
    if (publicTrackingResponse) {
      return publicTrackingResponse;
    }

    const driverPodResponse = await handleDriverPod(request, env, ctx);
    if (driverPodResponse) {
      return driverPodResponse;
    }

    const driverAppResponse = await handleDriverApp(request, env, ctx);
    if (driverAppResponse) {
      return driverAppResponse;
    }

    const menuSyncResponse = await handleSquareMenuSync(request, env, ctx);
    if (menuSyncResponse) {
      return menuSyncResponse;
    }

    const connectorResponse = await handleSquareRestaurantConnector(
      request,
      env,
      ctx
    );

    if (connectorResponse) {
      return connectorResponse;
    }

    const baseResponse = await baseWorker.fetch(request, env, ctx);
    return await applySquareLocationPricing(request, env, baseResponse);
  }
};
