/**
 * Plans configuration
 * Central place to change plan features/limits without touching business logic.
 * You can replace this with a DB-backed Plan model later if you want runtime edits
 * via an admin UI. For now, edit values here and restart the server.
 */

module.exports = {
  defaultPlan: 'free',
  plans: {
    free: {
      name: 'free',
      price: 0,
      currency: 'NGN',
      // maximum number of properties an agent on this plan can post
      postLimit: 5,
      description: 'Free plan — limited property posts',
    },

    trial: {
      name: 'trial',
      price: 0,
      currency: 'NGN',
      postLimit: 15,
      description: 'Trial users — elevated limits for trial period',
    },

    pro: {
      name: 'pro',
      price: 5000,
      currency: 'NGN',
      postLimit: 15,
      description: 'Pro plan — medium posting limits',
    },

    premium: {
      name: 'premium',
      price: 15000,
      currency: 'NGN',
      postLimit: 50,
      description: 'Premium plan — large posting limits',
    },

    enterprise: {
      name: 'enterprise',
      price: 50000,
      currency: 'NGN',
      postLimit: -1, // unlimited
      description: 'Enterprise plan — unlimited property posts with priority support',
    },
  },
};
