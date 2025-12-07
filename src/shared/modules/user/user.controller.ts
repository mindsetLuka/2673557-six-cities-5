import { inject, injectable } from 'inversify';
import { Request, Response } from 'express';
import { BaseController, HttpError, HttpMethod } from '../../libs/rest/index.js';
import { Logger } from '../../libs/logger/index.js';
import { Component } from '../../types/index.js';
import { CreateUserRequest } from './create-user-request.type.js';
import { Config } from 'convict';
import { StatusCodes } from 'http-status-codes';
import { fillDTO } from '../../helpers/common.js';
import { RestSchema } from '../../libs/config/rest.schema.js';
import { UserRdo } from './rdo/user.rdo.js';
import { LoggedUserRdo } from './rdo/logged-user.rdo.js';
import { UserService } from './user.service.interface.js';
import { LoginUserRequest } from './login-user-request.type.js';
import { UploadFileMiddleware } from '../../libs/rest/middleware/upload-file.middleware.js';
import { AuthMiddleware } from '../../libs/rest/middleware/auth.middleware.js';
import { JwtService } from '../../libs/auth/jwt.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string; name: string; type: string };
  }
}

@injectable()
export class UserController extends BaseController {
  constructor(
    @inject(Component.Logger) protected readonly logger: Logger,
    @inject(Component.UserService) private readonly userService: UserService,
    @inject(Component.Config) private readonly configService: Config<RestSchema>,
    @inject(Component.JwtService) private readonly jwtService: JwtService,
  ) {
    super(logger);
    this.logger.info('Register routes for UserController…');

    this.addRoute({ path: '/register', method: HttpMethod.Post, handler: this.create });
    this.addRoute({ path: '/login', method: HttpMethod.Post, handler: this.login });
    this.addRoute({
      path: '/avatar',
      method: HttpMethod.Post,
      handler: this.uploadAvatar,
      middlewares: [
        new AuthMiddleware(),
        new UploadFileMiddleware(
          this.configService.get('UPLOAD_DIRECTORY'),
          'avatar'
        )
      ]
    });
  }

  public async create(
    { body }: CreateUserRequest,
    res: Response,
  ): Promise<void> {
    const existsUser = await this.userService.findByEmail(body.email);

    if (existsUser) {
      throw new HttpError(
        StatusCodes.CONFLICT,
        `User with email «${body.email}» exists.`,
        'UserController'
      );
    }

    const result = await this.userService.create(body, this.configService.get('SALT'));
    this.created(res, fillDTO(UserRdo, result));
  }

  public async login(
    { body }: LoginUserRequest,
    res: Response,
  ): Promise<void> {
    const existsUser = await this.userService.findByEmail(body.email);

    if (!existsUser) {
      throw new HttpError(
        StatusCodes.UNAUTHORIZED,
        `User with email ${body.email} not found.`,
        'UserController',
      );
    }
    const isCorrectPassword = existsUser.verifyPassword(body.password, this.configService.get('SALT'));
    if (!isCorrectPassword) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Password is incorrect', 'UserController');
    }

    const token = await this.jwtService.sign({
      sub: existsUser._id.toString(),
      email: existsUser.email,
      name: existsUser.name,
      type: existsUser.type,
    });

    const responseData: LoggedUserRdo = {
      token,
      email: existsUser.email,
      avatar: existsUser.avatar,
      name: existsUser.name,
      type: existsUser.type,
    };

    this.ok(res, responseData);
  }

  public async uploadAvatar(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw new HttpError(StatusCodes.BAD_REQUEST, 'Avatar file is required', 'UserController');
    }

    if (!req.user) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'User is not authenticated', 'UserController');
    }

    const updatedUser = await this.userService.updateAvatar(req.user.id, req.file.filename);

    this.ok(res, fillDTO(UserRdo, updatedUser));
  }
}

