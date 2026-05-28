import { Request, Response, NextFunction } from "express";
import { authenticate } from "./authenticate";
import { apiKeyAuth } from "./apiKeyAuth";

export const authenticateOrApiKey = async (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    return authenticate(req, res, next);
  }
  if (req.headers["x-api-key"]) {
    return apiKeyAuth(req, res, next);
  }
  return res.status(401).json({ error: "Authentication required (JWT or API key)" });
};
