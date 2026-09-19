const TRIAL_DAYS = 30;
const SUBSCRIPTION_PRICE = 5000;
const WAVE_NUMBER = '0554183378';
const RENEWAL_DAYS = 30;

// Calcule l'état d'abonnement d'une école à partir de trial_ends_at / subscription_paid_until.
// `school` doit contenir ces deux champs (peuvent être null/undefined).
function getSubscriptionState(school) {
  const now = new Date();
  const trialEndsAt = school?.trial_ends_at ? new Date(school.trial_ends_at) : null;
  const paidUntil = school?.subscription_paid_until ? new Date(school.subscription_paid_until) : null;

  const inTrial = !!trialEndsAt && now < trialEndsAt;
  const isPaid = !!paidUntil && now < paidUntil;
  const active = inTrial || isPaid;

  let status = 'expired';
  let referenceDate = null;
  if (isPaid) { status = 'active'; referenceDate = paidUntil; }
  else if (inTrial) { status = 'trial'; referenceDate = trialEndsAt; }

  const daysLeft = referenceDate ? Math.max(0, Math.ceil((referenceDate - now) / 86400000)) : 0;

  return {
    active,
    status, // 'trial' | 'active' | 'expired'
    daysLeft,
    trialEndsAt: school?.trial_ends_at || null,
    paidUntil: school?.subscription_paid_until || null,
  };
}

module.exports = { getSubscriptionState, TRIAL_DAYS, SUBSCRIPTION_PRICE, WAVE_NUMBER, RENEWAL_DAYS };
