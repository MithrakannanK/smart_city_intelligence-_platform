const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const { startServer } = require("./server");

async function main() {
  const { MONGODB_URI, NODE_ENV } = process.env;

  if (MONGODB_URI) {
    try {
      await mongoose.connect(MONGODB_URI);
      // eslint-disable-next-line no-console
      console.log(`[server] MongoDB connected (${NODE_ENV || "dev"})`);
    } catch (err) {
      console.warn("[server] MongoDB connection failed; continuing without persistence:", err.message);
    }
  } else {
    console.warn("[server] MONGODB_URI not set; continuing without persistence");
  }

  startServer();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[server] Fatal startup error:", e);
  process.exit(1);
});

