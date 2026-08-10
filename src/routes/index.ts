import express, { Application, Request, Response } from "express";
import payphoneRouter from "./payphone.routes";
import orderRouter from "./order.routes";
import adminRouter from "./admin.routes";
import authRouter from "./auth.routes";
import productRouter from "./product.routes";
import categoryRouter from "./category.routes";
import * as mapsService from "../services/maps.service";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/payphone", payphoneRouter);
  router.use("/orders", orderRouter);
  router.use("/admin", adminRouter);
  router.use("/auth", authRouter);
  router.use("/products", productRouter);
  router.use("/categories", categoryRouter);

  // Resolves any pasted Google Maps link (short, long, regional domain, or bare
  // "lat,lng") into coordinates, distance from the store, and delivery cost.
  // Always 200: an unresolvable link returns null coords so the checkout can
  // show "envío por coordinar" instead of failing or guessing a price.
  router.get("/maps/resolve", async (req: Request, res: Response) => {
    const url = req.query.url as string
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing url parameter" })
      return
    }
    const quote = await mapsService.quoteFromMapsUrl(url)
    res.json(quote)
  })
}

export default routerApi;
