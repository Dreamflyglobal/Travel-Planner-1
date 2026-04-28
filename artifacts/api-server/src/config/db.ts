import mongoose from "mongoose";
import { logger } from "../lib/logger.js";

let isConnected = false;

export async function connectMongoDB(): Promise<void> {
  if (isConnected) {
    logger.info("MongoDB already connected");
    return;
  }

  const uri = process.env["MONGO_URI"];

  if (!uri) {
    logger.warn(
      "MONGO_URI not set — skipping MongoDB connection. " +
      "Add MONGO_URI to your environment variables to enable MongoDB."
    );
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    logger.info("MongoDB connected successfully");

    mongoose.connection.on("error", (err) => {
      logger.error({ err }, "MongoDB connection error");
    });

    mongoose.connection.on("disconnected", () => {
      isConnected = false;
      logger.warn("MongoDB disconnected");
    });
  } catch (err) {
    logger.error({ err }, "MongoDB connection failed — server will continue without MongoDB");
  }
}

export { mongoose };
