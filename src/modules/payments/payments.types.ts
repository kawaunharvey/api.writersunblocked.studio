export type OfferTier = 'free' | 'starter' | 'writer' | 'pro'

export type RecurringInterval = 'day' | 'week' | 'month' | 'year'

export interface CheckoutOffer {
  id: string
  tier: OfferTier
  name: string
  description: string
  interval: RecurringInterval
  amountCents?: number
  stripePriceId?: string
  currency?: string
}
