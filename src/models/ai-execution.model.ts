import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import type {
  AiExecutionError,
  AiExecutionStatus,
  AiExecutionTrigger,
  AiLlmCallRecord,
  AiNodeSpanRecord,
  AiToolCallRecord,
} from "../ai/types/ai-execution.js";

export interface IAiExecution {
  executionId: string;
  userId: mongoose.Types.ObjectId;
  threadId: mongoose.Types.ObjectId;
  messageIds: mongoose.Types.ObjectId[];
  trigger: AiExecutionTrigger;
  status: AiExecutionStatus;
  intent?: string;
  model?: string;
  provider?: string;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: AiLlmCallRecord[];
  toolCalls: AiToolCallRecord[];
  nodeSpans: AiNodeSpanRecord[];
  error?: AiExecutionError;
  graphError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AiExecutionDocument = HydratedDocument<IAiExecution>;
export type AiExecutionModel = Model<IAiExecution>;

const llmCallSchema = new Schema<AiLlmCallRecord>(
  {
    callSite: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true },
    durationMs: { type: Number, required: true, min: 0 },
    attemptNumber: { type: Number, min: 1 },
    fallbackFrom: { type: String, trim: true },
    promptTokens: { type: Number, min: 0 },
    completionTokens: { type: Number, min: 0 },
    totalTokens: { type: Number, min: 0 },
    status: { type: String, enum: ["success", "failed"], required: true },
    error: { type: String, trim: true },
  },
  { _id: false },
);

const toolCallSchema = new Schema<AiToolCallRecord>(
  {
    tool: { type: String, required: true, trim: true },
    durationMs: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["success", "failed"], required: true },
    error: { type: String, trim: true },
  },
  { _id: false },
);

const nodeSpanSchema = new Schema<AiNodeSpanRecord>(
  {
    node: { type: String, required: true, trim: true },
    durationMs: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["success", "failed"], required: true },
    error: { type: String, trim: true },
  },
  { _id: false },
);

const executionErrorSchema = new Schema<AiExecutionError>(
  {
    code: { type: String, trim: true },
    message: { type: String, required: true, trim: true },
    phase: {
      type: String,
      enum: ["orchestrator", "graph", "llm", "tool"],
    },
    node: { type: String, trim: true },
    tool: { type: String, trim: true },
  },
  { _id: false },
);

const aiExecutionSchema = new Schema<IAiExecution>(
  {
    executionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "Thread",
      required: true,
      index: true,
    },
    messageIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Message" }],
      default: [],
    },
    trigger: {
      type: String,
      enum: ["orchestrator", "api_run"],
      required: true,
    },
    status: {
      type: String,
      enum: ["running", "success", "failed"],
      required: true,
      index: true,
    },
    intent: { type: String, trim: true },
    model: { type: String, trim: true },
    provider: { type: String, trim: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    durationMs: { type: Number, min: 0 },
    promptTokens: { type: Number, required: true, default: 0, min: 0 },
    completionTokens: { type: Number, required: true, default: 0, min: 0 },
    totalTokens: { type: Number, required: true, default: 0, min: 0 },
    llmCalls: { type: [llmCallSchema], default: [] },
    toolCalls: { type: [toolCallSchema], default: [] },
    nodeSpans: { type: [nodeSpanSchema], default: [] },
    error: { type: executionErrorSchema, default: undefined },
    graphError: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          executionId: ret["executionId"],
          userId: String(ret["userId"]),
          threadId: String(ret["threadId"]),
          messageIds: Array.isArray(ret["messageIds"])
            ? ret["messageIds"].map((id) => String(id))
            : [],
          trigger: ret["trigger"],
          status: ret["status"],
          intent: ret["intent"],
          model: ret["model"],
          provider: ret["provider"],
          startedAt: ret["startedAt"],
          finishedAt: ret["finishedAt"],
          durationMs: ret["durationMs"],
          promptTokens: ret["promptTokens"],
          completionTokens: ret["completionTokens"],
          totalTokens: ret["totalTokens"],
          llmCalls: ret["llmCalls"],
          toolCalls: ret["toolCalls"],
          nodeSpans: ret["nodeSpans"],
          error: ret["error"],
          graphError: ret["graphError"],
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

aiExecutionSchema.index({ threadId: 1, startedAt: -1 });
aiExecutionSchema.index({ userId: 1, startedAt: -1 });

export const AiExecution: AiExecutionModel = mongoose.model<IAiExecution>(
  "AiExecution",
  aiExecutionSchema,
);
