import baseWorker from "./worker.js";
import { handleSquareRestaurantConnector } from "./square-restaurant-connector.js";
import { handleSquareMenuSync } from "./square-menu-sync.js";
import { handleRetailPickup } from "./retail-pickup.js";

export default {
  async fetch(request, env, ctx) {
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
