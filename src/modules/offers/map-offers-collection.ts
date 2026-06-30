import type { CheckoutOffer, OfferTier } from '@/modules/payments/payments.types'
import type {
  Offer,
  OffersCache,
  PayloadCheckoutGroup,
  PayloadFeatureDefinition,
  PayloadOfferDocument,
  SpecialOffer,
} from './offers.types'

type CheckoutFrequency = 'monthly' | 'yearly'

const formatPrice = (amountCents: number): string => {
  const dollars = amountCents / 100
  const hasFraction = amountCents % 100 !== 0
  return `$${hasFraction ? dollars.toFixed(2) : dollars.toFixed(0)}`
}

const buildIncludes = (
  featureValues: PayloadOfferDocument['featureValues'],
  features: PayloadFeatureDefinition[],
): string[] => {
  const featureLabels = new Map(features.map((feature) => [feature.id, feature.label]))

  if (!Array.isArray(featureValues)) {
    return []
  }

  return featureValues
    .filter((entry) => entry.value && entry.value !== '—')
    .map((entry) => {
      const label = featureLabels.get(entry.featureId)
      return label ? `${label}: ${entry.value}` : entry.value
    })
}

const toCheckoutOffer = (
  checkout: PayloadCheckoutGroup,
  tier: OfferTier,
  frequency: CheckoutFrequency,
): CheckoutOffer | null => {
  if (!checkout.offerId || !checkout.name || !checkout.description) {
    return null
  }

  return {
    id: checkout.offerId,
    tier,
    name: checkout.name,
    description: checkout.description,
    interval: frequency === 'monthly' ? 'month' : 'year',
    ...(checkout.stripePriceId ? { stripePriceId: checkout.stripePriceId } : {}),
    ...(checkout.amountCents != null ? { amountCents: checkout.amountCents } : {}),
    currency: 'usd',
  }
}

const toDisplayOffer = (
  checkout: PayloadCheckoutGroup,
  tier: OfferTier,
  frequency: CheckoutFrequency,
  options: {
    fallbackAmountCents?: number
    includes?: string[]
  } = {},
): Offer | null => {
  if (!checkout.offerId || !checkout.name || !checkout.description) {
    return null
  }

  if (tier === 'free' && options.fallbackAmountCents === 0) {
    return null
  }

  if (tier === 'free') {
    return null
  }

  const amountCents = checkout.amountCents ?? options.fallbackAmountCents

  return {
    id: checkout.offerId,
    tier,
    ...(checkout.stripePriceId ? { priceId: checkout.stripePriceId } : {}),
    name: checkout.name,
    description: checkout.description,
    price: formatPrice(amountCents ?? 0),
    ...(amountCents != null ? { amountCents } : {}),
    currency: 'usd',
    interval: frequency === 'monthly' ? 'month' : 'year',
    isActive: true,
    ...(options.includes?.length ? { includes: options.includes } : {}),
  }
}

const addCheckoutEntries = (
  checkout: PayloadCheckoutGroup | null | undefined,
  tier: OfferTier,
  frequency: CheckoutFrequency,
  offers: Offer[],
  checkoutById: Record<string, CheckoutOffer>,
  displayOptions: {
    fallbackAmountCents?: number
    includes?: string[]
  } = {},
): void => {
  if (!checkout) {
    return
  }

  const resolvedCheckout = toCheckoutOffer(checkout, tier, frequency)
  const displayOffer = toDisplayOffer(checkout, tier, frequency, displayOptions)

  if (resolvedCheckout && displayOffer) {
    offers.push(displayOffer)
    checkoutById[resolvedCheckout.id] = resolvedCheckout
  }
}

const getLinkedOfferSlug = (doc: PayloadOfferDocument): string | undefined => {
  if (!doc.linkedOffer) {
    return undefined
  }

  if (typeof doc.linkedOffer === 'string') {
    return doc.linkedOffer
  }

  return doc.linkedOffer.slug
}

export const mapOffersCollection = (
  offerDocs: PayloadOfferDocument[],
  features: PayloadFeatureDefinition[],
): OffersCache => {
  const regularOffers: Offer[] = []
  const specialOffers: SpecialOffer[] = []
  const customOffers: Offer[] = []
  const checkoutById: Record<string, CheckoutOffer> = {}

  for (const doc of offerDocs.filter((entry) => entry.offerType === 'regular')) {
    if (doc.skipCheckout || doc.subscriptionTier === 'free') {
      continue
    }

    const includes = buildIncludes(doc.featureValues, features)
    const variants: Offer[] = []

    addCheckoutEntries(
      doc.monthlyCheckout,
      doc.subscriptionTier,
      'monthly',
      variants,
      checkoutById,
      { fallbackAmountCents: doc.monthlyAmountCents, includes },
    )
    addCheckoutEntries(
      doc.yearlyCheckout,
      doc.subscriptionTier,
      'yearly',
      variants,
      checkoutById,
      { includes },
    )

    regularOffers.push(...variants)
  }

  for (const doc of offerDocs.filter((entry) => entry.offerType === 'special')) {
    const linkedSlug = getLinkedOfferSlug(doc)
    const parentDoc = offerDocs.find(
      (entry) => entry.offerType === 'regular' && entry.slug === linkedSlug,
    )
    const subscriptionTier = parentDoc?.subscriptionTier ?? doc.subscriptionTier
    const includes = parentDoc
      ? buildIncludes(parentDoc.featureValues, features)
      : buildIncludes(doc.featureValues, features)
    const variants: Offer[] = []

    addCheckoutEntries(
      doc.monthlyCheckout,
      subscriptionTier,
      'monthly',
      variants,
      checkoutById,
      { fallbackAmountCents: doc.monthlyAmountCents, includes },
    )
    addCheckoutEntries(
      doc.yearlyCheckout,
      subscriptionTier,
      'yearly',
      variants,
      checkoutById,
      { includes },
    )

    specialOffers.push({
      id: doc.slug,
      label: doc.label,
      linkedOfferSlug: linkedSlug ?? '',
      showLabel: doc.showLabel ?? true,
      offers: variants,
    })
  }

  for (const doc of offerDocs.filter((entry) => entry.offerType === 'custom')) {
    const includes = buildIncludes(doc.featureValues, features)
    addCheckoutEntries(
      doc.monthlyCheckout,
      doc.subscriptionTier,
      'monthly',
      customOffers,
      checkoutById,
      { fallbackAmountCents: doc.monthlyAmountCents, includes },
    )
    addCheckoutEntries(
      doc.yearlyCheckout,
      doc.subscriptionTier,
      'yearly',
      customOffers,
      checkoutById,
      { includes },
    )
  }

  return {
    regularOffers,
    specialOffers,
    customOffers,
    features: features.map((feature) => ({
      id: feature.id,
      label: feature.label,
      priority: feature.priority ?? 0,
      ...(feature.url ? { url: feature.url } : {}),
    })),
    checkoutById,
    syncedAt: new Date().toISOString(),
  }
}
