import express, { Application } from "express";
import payphoneRouter from "./payphone.routes";
import orderRouter from "./order.routes";
import adminRouter from "./admin.routes";
import authRouter from "./auth.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/payphone", payphoneRouter);
  router.use("/orders", orderRouter);
  router.use("/admin", adminRouter);
  router.use("/auth", authRouter);
}

export default routerApi;
