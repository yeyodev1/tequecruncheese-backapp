import express, { Application } from "express";
import payphoneRouter from "./payphone.routes";
import orderRouter from "./order.routes";
import adminRouter from "./admin.routes";
import authRouter from "./auth.routes";
import productRouter from "./product.routes";
import categoryRouter from "./category.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/payphone", payphoneRouter);
  router.use("/orders", orderRouter);
  router.use("/admin", adminRouter);
  router.use("/auth", authRouter);
  router.use("/products", productRouter);
  router.use("/categories", categoryRouter);
}

export default routerApi;
