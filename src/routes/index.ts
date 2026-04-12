import express, { Application, Request, Response } from "express";
import payphoneRouter from "./payphone.routes";
import orderRouter from "./order.routes";
import adminRouter from "./admin.routes";
import authRouter from "./auth.routes";
import productRouter from "./product.routes";
import categoryRouter from "./category.routes";

const MAPS_URL_RE = /^https:\/\/(maps\.app\.goo\.gl|maps\.google\.com|www\.google\.com\/maps)/

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/payphone", payphoneRouter);
  router.use("/orders", orderRouter);
  router.use("/admin", adminRouter);
  router.use("/auth", authRouter);
  router.use("/products", productRouter);
  router.use("/categories", categoryRouter);

  // Resolves Google Maps short URLs (maps.app.goo.gl) by following the redirect
  // and returning the final URL which contains extractable coordinates.
  router.get("/maps/resolve", async (req: Request, res: Response) => {
    const url = req.query.url as string
    if (!url || !MAPS_URL_RE.test(url)) {
      res.status(400).json({ error: "Invalid or missing url parameter" })
      return
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TequeBot/1.0)" },
      })
      res.json({ resolvedUrl: response.url })
    } catch {
      res.status(502).json({ error: "Could not resolve URL" })
    }
  })
}

export default routerApi;
