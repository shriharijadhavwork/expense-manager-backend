import type { SafeMessage } from "../services/message.service.js";

export type MessageCreatedEvent = {
  type: "message.created";
  threadId: string;
  message: SafeMessage;
};

/** Discriminated union — extend when adding typing, presence, etc. */
export type RealtimeEvent = MessageCreatedEvent;

export type RealtimeAdapter = {
  readonly name: string;
  publish(event: RealtimeEvent): void | Promise<void>;
};

export function threadRoomId(threadId: string): string {
  return `thread:${threadId}`;
}
