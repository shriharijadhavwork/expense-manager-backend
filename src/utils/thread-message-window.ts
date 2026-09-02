import {
  THREAD_MAX_USER_MESSAGES,
  computeMessageWindowEndsAt,
} from "../config/thread.constants.js";
import type { IThread } from "../models/thread.model.js";
import { ApiError } from "./api-error.js";

export type ThreadMessageWindowState = Pick<
  IThread,
  "userMessageCount"
> & {
  messageWindowEndsAt?: Date;
  createdAt?: Date;
};

function resolveMessageWindowEndsAt(
  thread: ThreadMessageWindowState,
): Date {
  if (thread.messageWindowEndsAt) {
    return thread.messageWindowEndsAt;
  }

  if (thread.createdAt) {
    return computeMessageWindowEndsAt(thread.createdAt);
  }

  return new Date(0);
}

export function isThreadMessageWindowOpen(
  thread: ThreadMessageWindowState,
  now = new Date(),
): boolean {
  return now.getTime() <= resolveMessageWindowEndsAt(thread).getTime();
}

export function hasUserMessageCapacity(
  thread: Pick<IThread, "userMessageCount">,
): boolean {
  return (thread.userMessageCount ?? 0) < THREAD_MAX_USER_MESSAGES;
}

export function assertThreadAcceptsUserMessage(
  thread: ThreadMessageWindowState,
  now = new Date(),
): void {
  const userMessageCount = thread.userMessageCount ?? 0;
  const state = { messageWindowEndsAt: resolveMessageWindowEndsAt(thread), userMessageCount };

  if (!isThreadMessageWindowOpen(state, now)) {
    throw ApiError.badRequest(
      "This conversation has closed — start a new thread to continue",
    );
  }

  if (!hasUserMessageCapacity({ userMessageCount })) {
    throw ApiError.badRequest(
      `This thread has reached the ${THREAD_MAX_USER_MESSAGES}-message limit — start a new thread to continue`,
    );
  }
}
