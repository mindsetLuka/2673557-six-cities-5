import express, { Express } from 'express';
import { injectable, inject } from 'inversify';
import { Config, RestSchema } from '../shared/libs/config/index.js';
import { Logger } from '../shared/libs/logger/index.js';
import { Component } from '../shared/types/component.enum.js';
import { DatabaseClient } from '../shared/libs/database-client/database-client.interface.js';
import { getMongoURI } from '../shared/helpers/index.js';
import { Controller, ExceptionFilter } from '../shared/libs/rest/index.js';
import { ParseTokenMiddleware } from '../shared/libs/rest/middleware/parse-token.middleware.js';
import { FavoriteController } from '../shared/modules/favorite/favorite.controller.js';
import { CommentController } from '../shared/modules/comment/comment.controller.js';
import { UserModel } from '../shared/modules/user/index.js';
import { UserType } from '../shared/types/index.js';
import { JwtService } from '../shared/libs/auth/jwt.service.js';


export let ANONYMOUS_USER_ID: string;

export async function ensureAnonymousUser() {
  let user = await UserModel.findOne({ name: 'Anonymous' });
  if (!user) {
    user = await UserModel.create({
      name: 'Anonymous',
      email: 'anon@example.com',
      password: 'anon',
      type: UserType.Standard,
      avatar: '',
    });
  }
  ANONYMOUS_USER_ID = user._id.toString();
}

@injectable()
export class Application {
  private server: Express;

  constructor(
    @inject(Component.Logger) private readonly logger: Logger,
    @inject(Component.Config) private readonly config: Config<RestSchema>,
    @inject(Component.DatabaseClient) private readonly databaseClient: DatabaseClient,
    @inject(Component.OfferController) private readonly offerController: Controller,
    @inject(Component.ExceptionFilter) private readonly appExceptionFilter: ExceptionFilter,
    @inject(Component.UserController) private readonly userController: Controller,
    @inject(Component.FavoriteController) private readonly favoriteController: FavoriteController,
    @inject(Component.CommentController) private readonly commentController: CommentController,
    @inject(Component.JwtService) private readonly jwtService: JwtService,
  ) {
    this.server = express();
  }

  private async _initDb() {
    const mongoUri = getMongoURI(
      this.config.get('DB_USER'),
      this.config.get('DB_PASSWORD'),
      this.config.get('DB_HOST'),
      this.config.get('DB_PORT'),
      this.config.get('DB_NAME'),
    );

    return this.databaseClient.connect(mongoUri);
  }

  private async _initMiddleware() {
    this.server.use(express.json());
    
    // Create middleware wrapper for ParseTokenMiddleware
    const parseTokenMiddleware = new ParseTokenMiddleware(this.jwtService);
    this.server.use((req, res, next) => {
      parseTokenMiddleware.execute(req, res, next).catch(next);
    });
    
    this.server.use('/static', express.static(this.config.get('UPLOAD_DIRECTORY')));
  }

  private async _initControllers() {
    this.server.use('/offers', this.offerController.router);
    this.server.use('/users', this.userController.router);
    this.server.use('/favorites', this.favoriteController.router);
    this.server.use('/comments', this.commentController.router);
  }

  private async _initExceptionFilters() {
    this.server.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => this.appExceptionFilter.catch(err, req, res, next));
  }

  private async _initServer() {
    const port = this.config.get('PORT');
    this.server.listen(port);
  }

  public async init() {
    this.logger.info('Application initialization');

    this.logger.info('Init database…');
    await this._initDb();
    this.logger.info('Init database completed');

    await ensureAnonymousUser();
    this.logger.info(`Anonymous user initialized with ID: ${ANONYMOUS_USER_ID}`);

    this.logger.info('Init app-level middleware');
    await this._initMiddleware();
    this.logger.info('App-level middleware initialization completed');

    this.logger.info('Init controllers');
    await this._initControllers();
    this.logger.info('Controller initialization completed');

    this.logger.info('Init exception filters');
    await this._initExceptionFilters();
    this.logger.info('Exception filters initialization compleated');

    this.logger.info('Try to init server…');
    await this._initServer();
    this.logger.info(`Server started on http://localhost:${this.config.get('PORT')}`);
  }
}
