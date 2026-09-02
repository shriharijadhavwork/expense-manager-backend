import type { SafeMessage } from "../graph/state.js";

export function getReferenceDateFromMessages(messages: SafeMessage[]): Date {
  const datedMessages = messages.filter((message) => message.createdAt);

  if (datedMessages.length === 0) {
    return new Date();
  }

  const latest = datedMessages.reduce((current, candidate) => {
    const currentTime = new Date(current.createdAt!).getTime();
    const candidateTime = new Date(candidate.createdAt!).getTime();
    return candidateTime > currentTime ? candidate : current;
  });

  return new Date(latest.createdAt!);
}

export function joinMessageText(messages: SafeMessage[]): string {
  return messages.map((message) => message.content).join("\n");
}
