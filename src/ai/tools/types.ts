export type ToolContext = {
  userId: string;
  threadId: string;
  messageId: string;
};

export type ToolUserContext = Pick<ToolContext, "userId">;
