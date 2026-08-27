import { messageRepository } from "../repositories/message.repository.js";
import { threadRepository } from "../repositories/thread.repository.js";
import { publishMessageCreated } from "../realtime/publish-message-created.js";
import { safeMessageFromDocument } from "./message.service.js";
import {
  buildGroupSystemMessage,
  type GroupSystemEvent,
} from "../utils/group-system-message.js";

/**
 * Posts a system message to the group's latest active thread (if any).
 * Failures are swallowed so membership mutations are not blocked.
 */
export async function postGroupSystemEvent(input: {
  groupId: string;
  actorUserId: string;
  event: GroupSystemEvent;
}): Promise<void> {
  try {
    const threads =
      await threadRepository.findActiveByGroupIdWithLastMessage(input.groupId);
    const latest = threads[0];
    if (!latest) {
      return;
    }

    const content = buildGroupSystemMessage(input.event);
    const threadId = String(latest._id);
    const now = new Date();

    const message = await messageRepository.create({
      threadId,
      userId: input.actorUserId,
      role: "system",
      content,
    });

    await threadRepository.updateById(threadId, {
      lastActivityAt: now,
    });

    await publishMessageCreated(safeMessageFromDocument(message));
  } catch (error) {
    console.warn("[group-system-message] Failed to post system event", error);
  }
}
