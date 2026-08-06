import mongoose from "mongoose";

export const GUEST_USER_OBJECT_ID = new mongoose.Types.ObjectId("000000000000000000000000");

/**
 * Safely converts any userId (string, guest-user, undefined, or ObjectId)
 * to a valid Mongoose ObjectId, falling back to static guest ObjectId.
 * Safely handles Jest/test mocks where mongoose.Types.ObjectId.isValid might be undefined.
 */
export function toValidObjectId(userId: any): mongoose.Types.ObjectId {
  if (!userId) {
    return GUEST_USER_OBJECT_ID;
  }

  // If userId is already an ObjectId object instance
  if (typeof userId === "object" && userId !== null) {
    return userId as mongoose.Types.ObjectId;
  }

  // Safely check Mongoose static isValid if available
  const hasIsValid = typeof (mongoose?.Types?.ObjectId as any)?.isValid === "function";
  if (hasIsValid) {
    if (mongoose.Types.ObjectId.isValid(userId)) {
      try {
        return new mongoose.Types.ObjectId(userId);
      } catch (err) {
        return GUEST_USER_OBJECT_ID;
      }
    }
    return GUEST_USER_OBJECT_ID;
  }

  // Fallback string validation for Jest/mock environments where isValid is not attached to ObjectId mock
  if (typeof userId === "string" && /^[0-9a-fA-F]{24}$/.test(userId)) {
    try {
      return new mongoose.Types.ObjectId(userId);
    } catch (err) {
      return GUEST_USER_OBJECT_ID;
    }
  }

  return GUEST_USER_OBJECT_ID;
}

/**
 * 🛡️ Global Mongoose Cast Interceptor:
 * Patches Mongoose's Schema.Types.ObjectId.prototype.cast so that any non-hex string
 * (e.g. "guest-user") passed anywhere in ANY query or model creation is automatically
 * converted to GUEST_USER_OBJECT_ID instead of throwing a CastError!
 */
export function setupMongooseGlobalObjectIdCastProtection(): void {
  try {
    const SchemaObjectId = (mongoose.Schema?.Types?.ObjectId || (mongoose.Schema as any)?.ObjectId) as any;
    if (SchemaObjectId && SchemaObjectId.prototype && !SchemaObjectId.prototype._guestPatched) {
      const originalCast = SchemaObjectId.prototype.cast;
      SchemaObjectId.prototype.cast = function (val: any, scope?: any, init?: any, type?: any) {
        if (val === "guest-user" || (typeof val === "string" && val.length > 0 && !/^[0-9a-fA-F]{24}$/.test(val))) {
          return GUEST_USER_OBJECT_ID;
        }
        try {
          return originalCast.call(this, val, scope, init, type);
        } catch (err) {
          return GUEST_USER_OBJECT_ID;
        }
      };
      SchemaObjectId.prototype._guestPatched = true;
    }
  } catch (err) {
    console.warn("[mongoUtils] Global ObjectId cast protection patch skipped:", err);
  }
}

// Automatically apply the global patch on module import
setupMongooseGlobalObjectIdCastProtection();
