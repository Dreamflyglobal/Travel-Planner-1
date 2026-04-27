import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dreamflyglobal_dev_secret_change_in_prod";
const JWT_EXPIRES_IN = "30d";

export interface JwtPayload {
  userId: number;
  role: string;
  phone?: string;
  email?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
