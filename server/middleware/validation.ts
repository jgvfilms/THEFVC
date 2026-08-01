import type { Request, Response, NextFunction } from "express";

/**
 * Validation middleware factory.
 * Validates request body, query, or params against a Zod schema.
 * Returns 400 with detailed error messages on validation failure.
 *
 * Usage:
 *   app.post("/api/foo", validate({ body: insertUserSchema }), handler)
 */

// Use a generic type that accepts any Zod schema
type ZodSchemaLike = {
  safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: { errors: unknown[] } };
};

export interface ValidationSchemas {
  body?: ZodSchemaLike;
  query?: ZodSchemaLike;
  params?: ZodSchemaLike;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: result.error?.errors || [],
          });
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: result.error?.errors || [],
          });
        }
        Object.defineProperty(req, "query", {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: result.error?.errors || [],
          });
        }
        req.params = result.data as any;
      }

      next();
    } catch (err) {
      return res.status(400).json({ error: "Validation error" });
    }
  };
}
