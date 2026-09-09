import baseWorker from "./worker.js";
import { handleDoorDashAuth } from "./doordash-auth.js";
import { handleSquareRestaurantConnector } from "./square-restaurant-connector.js";
import { handleSquareMenuSync } from "./square-menu-sync.js";
import { handleRetailPickup } from "./retail-pickup.js";
import { handleMarketplaceOrders } from "./marketplace-orders.js";
import { handleSquarePaymentHardening } from "./square-payment-hardening.js";

export default {
  async fetch(request, env, ctx) {
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

    return baseWorker.fetch(request, env, ctx);
  }
};
