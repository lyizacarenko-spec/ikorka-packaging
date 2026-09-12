import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "12h";

export type Role = "owner" | "editor" | "viewer";

export interface AuthedUser {
  id: number;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function login(pin: string): Promise<{ token: string; user: AuthedUser } | null> {
  const { rows } = await pool.query<{ id: number; name: string; pin_hash: string; role: Role }>(
    "SELECT id, name, pin_hash, role FROM users"
  );
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await bcrypt.compare(pin, row.pin_hash);
    if (ok) {
      const user: AuthedUser = { id: row.id, name: row.name, role: row.role };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_TTL });
      return { token, user };
    }
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Не авторизовано" });
  }
  try {
    const token = header.slice("Bearer ".length);
    const decoded = jwt.verify(token, JWT_SECRET) as AuthedUser;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Недійсний або прострочений токен" });
  }
}

/** Owner and editor can write; viewer is read-only. Call after requireAuth. */
export function requireEditor(req: Request, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== "owner" && req.user.role !== "editor")) {
    return res.status(403).json({ error: "Недостатньо прав" });
  }
  next();
}

/** Only owner can manage users / reference-data structure. Call after requireAuth. */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ error: "Тільки для власника" });
  }
  next();
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}
