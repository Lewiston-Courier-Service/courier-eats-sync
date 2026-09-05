import baseWorker from "./worker.js";
import { handleSquareRestaurantConnector } from "./square-restaurant-connector.js";
import { handleMarketplaceOrders } from "./marketplace-orders.js";

export default {
  async fetch(request, env, ctx) {
    const marketplaceResponse = await handleMarketplaceOrders(request, env, ctx);
    if (marketplaceResponse) {
      return marketplaceResponse;
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
