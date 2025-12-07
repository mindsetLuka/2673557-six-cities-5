import { inject, injectable } from 'inversify';
import { Request, Response } from 'express';
import { BaseController, HttpError, HttpMethod } from '../../libs/rest/index.js';
import { Logger } from '../../libs/logger/index.js';
import { City, Component } from '../../types/index.js';
import { OfferService } from './offer.service.interface.js';
import { FavoriteService } from '../favorite/favorite.service.interface.js';
import { CreateOfferDto, OfferRdo } from './index.js';
import { fillDTO } from '../../helpers/index.js';
import { StatusCodes } from 'http-status-codes';
import { ValidateObjectIdMiddleware } from '../../libs/rest/middleware/validate-objectid.middleware.js';
import { DocumentExistsMiddleware } from '../../libs/rest/middleware/document-exist.middleware.js';
import { ANONYMOUS_USER_ID } from '../../../rest/index.js';

@injectable()
export class OfferController extends BaseController {
  constructor(
    @inject(Component.Logger) logger: Logger,
    @inject(Component.OfferService) private readonly offerService: OfferService,
    @inject(Component.FavoriteService) private readonly favoriteService: FavoriteService,
  ) {
    super(logger);

    this.logger.info('Register routes for OfferController');

    this.addRoute({
      path: '/:offerId',
      method: HttpMethod.Get,
      handler: this.show,
      middlewares: [
        new ValidateObjectIdMiddleware('offerId'),
        new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId')
      ]
    });
    this.addRoute({ path: '/', method: HttpMethod.Get, handler: this.index });
    this.addRoute({ path: '/', method: HttpMethod.Post, handler: this.create });
    this.addRoute({
      path: '/:offerId',
      method: HttpMethod.Patch,
      handler: this.update,
      middlewares: [
        new ValidateObjectIdMiddleware('offerId'),
        new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId')
      ]
    });
    this.addRoute({
      path: '/:offerId',
      method: HttpMethod.Delete,
      handler: this.delete,
      middlewares: [
        new ValidateObjectIdMiddleware('offerId'),
        new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId')
      ]
    });

    this.addRoute({ path: '/premium/:city', method: HttpMethod.Get, handler: this.getPremium });
  }

  public async index(req: Request, res: Response): Promise<void> {
    const offers = await this.offerService.find();
    const userId = req.user?.id || ANONYMOUS_USER_ID;
    
    const offersWithFavorite = await Promise.all(
      offers.map(async (offer) => {
        const isFavorite = await this.favoriteService.isFavorite(userId, offer._id.toString());
        return {
          ...offer.toObject(),
          isFavorite,
        };
      })
    );
    
    this.ok(res, fillDTO(OfferRdo, offersWithFavorite));
  }

  public async create(
    { body }: Request<Record<string, unknown>, Record<string, unknown>, CreateOfferDto>,
    res: Response
  ): Promise<void> {
    const exists = await this.offerService.find();
    if (exists.find((o) => o.title === body.title)) {
      throw new HttpError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Offer with title "${body.title}" exists.`,
        'OfferController'
      );
    }

    const result = await this.offerService.create(body);
    this.created(res, fillDTO(OfferRdo, result));
  }

  public async show(req: Request, res: Response): Promise<void> {
    const offer = await this.offerService.findById(req.params.offerId);
    const userId = req.user?.id || ANONYMOUS_USER_ID;
    const isFavorite = await this.favoriteService.isFavorite(userId, req.params.offerId);
    
    const offerWithFavorite = {
      ...offer?.toObject(),
      isFavorite,
    };
    
    this.ok(res, fillDTO(OfferRdo, offerWithFavorite));
  }

  public async update({ params, body }: Request, res: Response): Promise<void> {
    const updated = await this.offerService.updateById(params.offerId, body);

    this.ok(res, fillDTO(OfferRdo, updated));
  }

  public async delete(_req: Request, res: Response): Promise<void> {
    this.noContent(res);
  }

  public async getPremium(req: Request, res: Response): Promise<void> {
    const city = req.params.city as City;
    const offers = await this.offerService.findPremiumByCity(city);
    const userId = req.user?.id || ANONYMOUS_USER_ID;
    
    const offersWithFavorite = await Promise.all(
      offers.map(async (offer) => {
        const isFavorite = await this.favoriteService.isFavorite(userId, offer._id.toString());
        return {
          ...offer.toObject(),
          isFavorite,
        };
      })
    );
    
    this.ok(res, fillDTO(OfferRdo, offersWithFavorite));
  }
}
