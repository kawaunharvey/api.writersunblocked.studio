import type { CheckoutOffer, OfferTier } from '@/modules/payments/payments.types'

export type PayloadCheckoutGroup = {
  offerId?: string | null
  stripePriceId?: string | null
  amountCents?: number | null
  name?: string | null
  description?: string | null
}

export type PayloadFeatureDefinition = {
  id: string
  label: string
  priority?: number | null
  url?: string | null
}

export type PayloadLinkedOffer = {
  slug: string
}

export type PayloadOfferDocument = {
  slug: string
  offerType: 'regular' | 'special' | 'custom'
  label: string
  subtitle?: string | null
  buttonText: string
  monthlyAmountCents: number
  skipCheckout?: boolean | null
  subscriptionTier: OfferTier
  showLabel?: boolean | null
  linkedOffer?: string | PayloadLinkedOffer | null
  featureValues?:
    | {
        featureId: string
        value: string
      }[]
    | null
  monthlyCheckout?: PayloadCheckoutGroup | null
  yearlyCheckout?: PayloadCheckoutGroup | null
}

export type PayloadFeaturesGlobal = {
  features?: PayloadFeatureDefinition[] | null
}

export type PayloadOffersResponse = {
  docs: PayloadOfferDocument[]
}

export type Feature = {
  id: string
  label: string
  priority: number
  url?: string
}

export type Offer = {
  id: string
  tier: 'starter' | 'writer' | 'pro'
  priceId?: string
  name: string
  description: string
  price: string
  amountCents?: number
  currency?: string
  interval: string
  badge?: string
  isActive: boolean
  includes?: string[]
}

export type SpecialOffer = {
  id: string
  label: string
  linkedOfferSlug: string
  showLabel: boolean
  offers: Offer[]
}

export type OffersCache = {
  regularOffers: Offer[]
  specialOffers: SpecialOffer[]
  customOffers: Offer[]
  features: Feature[]
  checkoutById: Record<string, CheckoutOffer>
  syncedAt: string
}

export type SyncOffersResult = {
  syncedAt: string
  regularOfferCount: number
  specialOfferCount: number
  customOfferCount: number
}
