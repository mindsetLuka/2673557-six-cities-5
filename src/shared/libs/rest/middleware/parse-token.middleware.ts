import { Request, Response, NextFunction } from 'express';
import { Middleware } from './middleware.interface.js';
import { JwtService } from '../auth/index.js';
import { StatusCodes } from 'http-status-codes';
import { HttpError } from '../errors/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        type: string;
      };
    }
  }
}

export class ParseTokenMiddleware implements Middleware {
  constructor(private readonly jwtService: JwtService) {}

  public async execute(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authorizationHeader = req.headers.authorization?.split(' ')[1];

    if (!authorizationHeader) {
      return next();
    }

    try {
      const { payload } = await this.jwtService.verify(authorizationHeader);
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        type: payload.type,
      };
    } catch (error) {
      throw new HttpError(
        StatusCodes.UNAUTHORIZED,
        'Invalid token',
        'ParseTokenMiddleware',
      );
    }

    next();
  }
}
