import express, { Application } from "express";
import payphoneRouter from "./payphone.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/payphone", payphoneRouter);
}

export default routerApi;
