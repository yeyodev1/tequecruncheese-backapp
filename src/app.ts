import express from "express";
import cors from "cors";
import http from "http";
import routerApi from "./routes";
import { globalErrorHandler } from "./middlewares/globalErrorHandler.middleware";

const whitelist = [
  "http://localhost:8100",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8101",
  "https://tequecrunchesse.netlify.app",
  "https://testing-storybrand-frontend.bakano.ec",
  "https://tequecruncheese.com",
  // Netlify serves the apex and the www host; only the apex was listed, so
  // anyone landing on www got a CORS failure on every request.
  "https://www.tequecruncheese.com",
  // The storefront's own Vercel hostnames. The custom domain is what customers
  // use, but the .vercel.app aliases are what we open to check a deploy — and
  // they were failing every API call with a CORS error that looked like an
  // outage.
  "https://tequecruncheese-webpage.vercel.app",
  "https://tequecruncheese-webpage-proyectos-de-diego.vercel.app"
];

/** Preview deploys get a fresh hostname per build; allow the project's own. */
const PREVIEW_ORIGIN_RE = /^https:\/\/tequecruncheese-webpage-[a-z0-9-]+\.vercel\.app$/;

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || whitelist.includes(origin) || PREVIEW_ORIGIN_RE.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

export function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "50mb" }));

  app.get("/", (_req, res) => {
    res.send("Server is alive");
  });

  routerApi(app);

  app.use(globalErrorHandler);

  const server = http.createServer(app);

  return { app, server };
}
