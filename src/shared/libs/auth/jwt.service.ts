import { SignJWT, jwtVerify } from 'jose';
import { injectable, inject } from 'inversify';
import { Config } from '../config/config.interface.js';
import { Component } from '../../types/index.js';
import { RestSchema } from '../config/rest.schema.js';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  type: string;
  iat?: number;
  [key: string]: string | number | undefined;
}

export interface DecodedToken {
  payload: TokenPayload;
}

@injectable()
export class JwtService {
  private readonly jwtSecret: string;

  constructor(
    @inject(Component.Config) private readonly config: Config<RestSchema>
  ) {
    this.jwtSecret = this.config.get('JWT_SECRET');
  }

  public async sign(payload: TokenPayload): Promise<string> {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(this.jwtSecret);

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secretKey);

    return token;
  }

  public async verify(token: string): Promise<DecodedToken> {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(this.jwtSecret);

    const decoded = await jwtVerify(token, secretKey);

    return { payload: decoded.payload as TokenPayload };
  }
}
