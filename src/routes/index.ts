import express, { Application, Request, Response } from "express";
import payphoneRouter from "./payphone.routes";
import orderRouter from "./order.routes";
import adminRouter from "./admin.routes";
import authRouter from "./auth.routes";
import productRouter from "./product.routes";
import categoryRouter from "./category.routes";
import * as mapsService from "../services/maps.service";
import { testEmail } from "../controllers/diagnostics.controller";
import { SCHEDULE_CONFIG, isStoreOpen } from "../services/schedule.service";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/payphone", payphoneRouter);

  // Verify mail delivery from production without placing a real order.
  router.get("/diagnostics/test-email", testEmail);
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

  // Opening hours and booking window for the scheduled-order picker.
  // `serverNow` lets the browser build slots against our clock, so a device
  // with a skewed clock does not offer a slot the API will then reject.
  // `isOpen` is resolved here rather than in the browser so the storefront can
  // say "cerrado" before the customer fills in a whole checkout, and says it
  // from the same clock that will later accept or reject the order.
  router.get("/schedule/config", (_req: Request, res: Response) => {
    res.json({
      ...SCHEDULE_CONFIG,
      serverNow: new Date().toISOString(),
      isOpen: isStoreOpen(),
    })
  })
}

export default routerApi;
