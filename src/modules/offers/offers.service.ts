import { AppConfigService } from '@/common/config/app-config.service'
import type { CheckoutOffer } from '@/modules/payments/payments.types'
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common'
import Redis from 'ioredis'
import { mapOffersCollection } from './map-offers-collection'
import type {
  Offer,
  OffersCache,
  PayloadFeatureDefinition,
  PayloadFeaturesGlobal,
  PayloadOfferDocument,
  PayloadOffersResponse,
  SpecialOffer,
  SyncOffersResult,
} from './offers.types'

const CACHE_KEY = 'offers:cache'

@Injectable()
export class OffersService implements OnModuleInit {
  private readonly redis: Redis
  private readonly logger = new Logger(OffersService.name)

  constructor(private readonly config: AppConfigService) {
    const url = new URL(config.redisUrl)
    this.redis = new Redis({
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    })
  }

  async onModuleInit(): Promise<void> {
    const cache = await this.getCache()
    if (cache) {
      return
    }

    try {
      await this.syncFromPayload()
      this.logger.log('Offers cache bootstrapped from Payload CMS')
    } catch (error) {
      this.logger.warn(
        `Offers cache bootstrap skipped: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async getRegularOffers(): Promise<Offer[]> {
    const cache = await this.getCacheOrSync()
    return cache?.regularOffers ?? []
  }

  async getSpecialOffers(): Promise<SpecialOffer[]> {
    const cache = await this.getCacheOrSync()
    return cache?.specialOffers ?? []
  }

  async getCustomOffers(): Promise<Offer[]> {
    const cache = await this.getCacheOrSync()
    return cache?.customOffers ?? []
  }

  async getCheckoutOffer(offerId: string): Promise<CheckoutOffer> {
    const cache = await this.getCacheOrSync()

    if (!cache) {
      throw new NotFoundException(
        `Offer "${offerId}" was not found. Offers cache is empty — save an offer in Payload CMS to sync.`,
      )
    }

    const offer = cache.checkoutById[offerId.trim()]
    if (!offer) {
      throw new NotFoundException(
        `Offer "${offerId}" was not found in cached offers. Save an offer in Payload CMS to sync the latest offers.`,
      )
    }

    return offer
  }

  async syncFromPayload(): Promise<OffersCache> {
    const [offerDocs, features] = await Promise.all([
      this.fetchOffersFromPayload(),
      this.fetchFeaturesFromPayload(),
    ])

    const cache = mapOffersCollection(offerDocs, features)
    await this.redis.set(CACHE_KEY, JSON.stringify(cache))
    this.logger.log(
      `Synced offers from Payload CMS (${cache.regularOffers.length} regular, ${cache.specialOffers.length} special, ${cache.customOffers.length} custom)`,
    )
    return cache
  }

  async syncAndReport(): Promise<SyncOffersResult> {
    const cache = await this.syncFromPayload()
    return {
      syncedAt: cache.syncedAt,
      regularOfferCount: cache.regularOffers.length,
      specialOfferCount: cache.specialOffers.length,
      customOfferCount: cache.customOffers.length,
    }
  }

  private async getCacheOrSync(): Promise<OffersCache | null> {
    let cache = await this.getCache()

    if (!cache) {
      try {
        cache = await this.syncFromPayload()
      } catch {
        return null
      }
    }

    return cache
  }

  private async getCache(): Promise<OffersCache | null> {
    const raw = await this.redis.get(CACHE_KEY)
    if (!raw) {
      return null
    }

    try {
      const parsed = JSON.parse(raw) as OffersCache
      if (Array.isArray(parsed.regularOffers)) {
        return parsed
      }

      // Legacy cache shape from pricing global migration
      if (Array.isArray((parsed as { offers?: Offer[] }).offers)) {
        return null
      }

      return parsed
    } catch {
      this.logger.warn('Failed to parse offers cache — clearing key')
      await this.redis.del(CACHE_KEY)
      return null
    }
  }

  private async fetchOffersFromPayload(): Promise<PayloadOfferDocument[]> {
    const origin = this.config.marketingSiteOrigin
    const apiKey = this.config.payloadApiKey
    const url = `${origin.replace(/\/$/, '')}/api/offers?limit=100&depth=1&sort=sortOrder`

    const response = await this.fetchPayload(url, apiKey, 'offers collection')
    const payload = (await response.json()) as PayloadOffersResponse
    return payload.docs ?? []
  }

  private async fetchFeaturesFromPayload(): Promise<PayloadFeatureDefinition[]> {
    const origin = this.config.marketingSiteOrigin
    const apiKey = this.config.payloadApiKey
    const url = `${origin.replace(/\/$/, '')}/api/globals/features`

    const response = await this.fetchPayload(url, apiKey, 'features global')
    const payload = (await response.json()) as PayloadFeaturesGlobal
    return payload.features ?? []
  }

  private async fetchPayload(
    url: string,
    apiKey: string,
    label: string,
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `users API-Key ${apiKey}`,
        },
      })

      if (!response.ok) {
        const body = await response.text()
        throw new ServiceUnavailableException(
          `Payload CMS returned ${response.status} for ${label}: ${body.slice(0, 200)}`,
        )
      }

      return response
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error
      }

      throw new ServiceUnavailableException(
        `Failed to reach Payload CMS at ${url}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
