import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export interface IGroup {
  name: string;
  createdBy: mongoose.Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GroupDocument = HydratedDocument<IGroup>;
export type GroupModel = Model<IGroup>;

const groupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          name: ret["name"],
          createdBy: String(ret["createdBy"]),
          deletedAt: ret["deletedAt"],
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

export const Group: GroupModel = mongoose.model<IGroup>("Group", groupSchema);
