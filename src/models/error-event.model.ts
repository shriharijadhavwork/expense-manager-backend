import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import type { ErrorEventSource } from "../types/error-event.js";

export interface IErrorEvent {
  source: ErrorEventSource;
  userId?: mongoose.Types.ObjectId;
  threadId?: mongoose.Types.ObjectId;
  messageId?: mongoose.Types.ObjectId;
  executionId?: string;
  model?: string;
  callSite?: string;
  httpStatus?: number;
  errorCode?: string;
  requestPayload?: Record<string, unknown>;
  errorPayload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ErrorEventDocument = HydratedDocument<IErrorEvent>;
export type ErrorEventModel = Model<IErrorEvent>;

const errorEventSchema = new Schema<IErrorEvent>(
  {
    source: {
      type: String,
      enum: ["ai_llm", "ai_orchestrator", "ai_tool", "api", "service", "unknown"],
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "Thread",
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      index: true,
    },
    executionId: {
      type: String,
      trim: true,
      index: true,
    },
    model: {
      type: String,
      trim: true,
      index: true,
    },
    callSite: {
      type: String,
      trim: true,
      index: true,
    },
    httpStatus: {
      type: Number,
      min: 100,
      max: 599,
      index: true,
    },
    errorCode: {
      type: String,
      trim: true,
      index: true,
    },
    requestPayload: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    errorPayload: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          source: ret["source"],
          userId: ret["userId"] ? String(ret["userId"]) : undefined,
          threadId: ret["threadId"] ? String(ret["threadId"]) : undefined,
          messageId: ret["messageId"] ? String(ret["messageId"]) : undefined,
          executionId: ret["executionId"],
          model: ret["model"],
          callSite: ret["callSite"],
          httpStatus: ret["httpStatus"],
          errorCode: ret["errorCode"],
          requestPayload: ret["requestPayload"],
          errorPayload: ret["errorPayload"],
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

errorEventSchema.index({ source: 1, errorCode: 1, createdAt: -1 });
errorEventSchema.index({ userId: 1, createdAt: -1 });

export const ErrorEvent: ErrorEventModel = mongoose.model<IErrorEvent>(
  "ErrorEvent",
  errorEventSchema,
);
