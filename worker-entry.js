import baseWorker from "./worker.js";
import { handleSquareRestaurantConnector } from "./square-restaurant-connector.js";

export default {
  async fetch(request, env, ctx) {
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
