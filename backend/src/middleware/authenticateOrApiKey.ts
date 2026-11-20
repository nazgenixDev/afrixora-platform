import { Request, Response, NextFunction } from "express";
import { authenticate } from "./authenticate";
import { apiKeyAuth } from "./apiKeyAuth";

export const authenticateOrApiKey = async (req: Request, res: Response, next: NextFunction) => {
  if (/^Bearer /i.test(req.headers.authorization ?? "")) {
    return authenticate(req, res, next);
  }
  if (req.headers["x-api-key"]) {
    return apiKeyAuth(req, res, next);
  }
  if (req.cookies?.access_token) {
    return authenticate(req, res, next);
  }
  return res.status(401).json({ error: "Authentication required (JWT or API key)" });
};
