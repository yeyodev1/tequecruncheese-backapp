import "dotenv/config";
import { dbConnect } from "./config/mongo";
import { createApp } from "./app";

const port = process.env.PORT || 8100;

const { app, server } = createApp();

server.timeout = 10 * 60 * 1000;

// Connect to DB
dbConnect();

// Only listen if not running on Vercel
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
