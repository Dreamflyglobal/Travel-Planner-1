import { Schema, model, models, type Document } from "mongoose";

export interface AppSettingsDocument extends Document {
  namespace: string;
  data: Record<string, unknown>;
  updatedAt: Date;
  createdAt: Date;
}

const AppSettingsSchema = new Schema<AppSettingsDocument>(
  {
    namespace: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  {
    timestamps: true,
    collection: "app_settings",
  },
);

export const AppSettingsModel =
  models["AppSettings"] ?? model<AppSettingsDocument>("AppSettings", AppSettingsSchema);
