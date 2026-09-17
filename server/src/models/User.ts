/*
 * ─── User model ────────────────────────────────────────
 */
import mongoose, { Schema, type Document } from "mongoose";

export type UserRole = "user" | "admin" | "VIEWER" | "ANALYST" | "TRADER" | "OPERATOR" | "ADMIN" | "SYSTEM";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin", "VIEWER", "ANALYST", "TRADER", "OPERATOR", "ADMIN", "SYSTEM"],
      default: "user",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const User = mongoose.model<IUser>("User", UserSchema);
