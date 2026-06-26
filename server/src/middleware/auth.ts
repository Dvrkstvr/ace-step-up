import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedUser {
  id: string;
  username: string;
  isAdmin?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  req.user = { id: 'local-user', username: 'local-user' };
  next();
}

export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  req.user = { id: 'local-user', username: 'local-user' };
  next();
}

export function adminMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  req.user = { id: 'local-user', username: 'local-user', isAdmin: true };
  next();
}
