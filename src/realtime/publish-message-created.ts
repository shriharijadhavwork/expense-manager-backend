import type { SafeMessage } from "../services/message.service.js";
import { realtimePublisher } from "./publisher.js";

export async function publishMessageCreated(message: SafeMessage): Promise<void> {
  await realtimePublisher.publish({
    type: "message.created",
    threadId: message.threadId,
    message,
  });
}
