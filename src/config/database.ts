import mongoose from "mongoose";
import { backfillThreadModelBatch4 } from "../migrations/backfill-thread-model.js";
import { env } from "./env.js";

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    return;
  }

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(env.MONGODB_URI);
    isConnected = true;
    console.log("MongoDB connected");

    const backfilled = await backfillThreadModelBatch4();
    if (backfilled > 0) {
      console.log(`Backfilled ${backfilled} legacy thread(s) for Batch 4 fields`);
    }
  } catch (error) {
    console.error("MongoDB connection failed");
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) {
    return;
  }

  await mongoose.disconnect();
  isConnected = false;
  console.log("MongoDB disconnected");
}

export function getDatabaseReadyState(): number {
  return mongoose.connection.readyState;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
