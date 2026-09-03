import baseWorker from "./worker.js";
import { handleSquareRestaurantConnector } from "./square-restaurant-connector.js";
import { handleRetailPickup } from "./retail-pickup.js";

export default {
  async fetch(request, env, ctx) {
    const retailResponse = await handleRetailPickup(request, env, ctx);
    if (retailResponse) {
      return retailResponse;
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
