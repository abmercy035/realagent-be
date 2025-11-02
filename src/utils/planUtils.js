const PlanConfig = require('../config/plans');
const Property = require('../models/Property');
const User = require('../models/User');
const PlanModel = require('../models/Plan');

/**
 * Helpers around plans and limits
 */

function getPlanConfig(planName) {
  if (!planName) return PlanConfig.plans[PlanConfig.defaultPlan];
  return PlanConfig.plans[planName] || PlanConfig.plans[PlanConfig.defaultPlan];
}

// Async plan config fetch from DB, fallback to file
async function getPlanConfigAsync(planName) {
  try {
    if (!planName) planName = PlanConfig.defaultPlan;
    const dbPlan = await PlanModel.findOne({ name: planName }).lean().exec();
    if (dbPlan) return dbPlan;
  } catch (e) {
    // ignore DB errors and fall back to file
    console.warn('getPlanConfigAsync DB lookup failed', e.message || e);
  }
  return getPlanConfig(planName);
}

/**
 * Determine the effective plan for a user.
 * If the user is on trial (subscription.status === 'trialing'), return 'trial'.
 * Otherwise return subscription.plan or default 'free'.
 */
function getUserPlan(user) {
  if (!user) return getPlanConfig(PlanConfig.defaultPlan);
  const sub = user.subscription || {};
  if (sub.status === 'trialing') return getPlanConfig('trial');
  const planName = sub.plan || PlanConfig.defaultPlan;
  return getPlanConfig(planName);
}

async function getUserPlanAsync(user) {
  if (!user) return await getPlanConfigAsync(PlanConfig.defaultPlan);
  const sub = user.subscription || {};
  if (sub.status === 'trialing') return await getPlanConfigAsync('trial');
  const planName = sub.plan || PlanConfig.defaultPlan;
  return await getPlanConfigAsync(planName);
}

function isInGrace(user) {
  if (!user) return false;
  const s = user.subscription || {};
  if (!s.graceUntil) return false;
  try {
    const g = new Date(s.graceUntil);
    return g.getTime() > Date.now();
  } catch (e) {
    return false;
  }
}

/**
 * Count how many properties a user (agent) currently has (excluding 'deleted').
 * Returns a number.
 */
async function countPropertiesForAgent(userId) {
  if (!userId) return 0;
  const query = { agent: userId, status: { $ne: 'deleted' } };
  return Property.countDocuments(query).exec();
}

/**
 * Returns { allowed: boolean, reason?: string, current?: number, limit?: number }
 */
async function canCreateProperty(user) {
  // ensure we have up-to-date user object (accept either id or doc)
  let userDoc = user;
  if (!userDoc) return { allowed: false, reason: 'No user' };
  if (typeof userDoc === 'string' || userDoc._id === undefined) {
    userDoc = await User.findById(userDoc).exec();
    if (!userDoc) return { allowed: false, reason: 'User not found' };
  }

  // Admin bypass
  if (userDoc.role === 'admin') {
    return { allowed: true, reason: 'admin bypass' };
  }

  const plan = await getUserPlanAsync(userDoc);
  const limit = plan.postLimit || 0;
  const current = await countPropertiesForAgent(userDoc._id);
  const inGrace = isInGrace(userDoc);

  // If user is in grace period we allow creation here, but caller may wish to
  // enforce post-creation cleanup (e.g., delete newly created property that
  // pushes the total over the limit). We therefore return inGrace flag.
  if (!inGrace && current >= limit) {
    return {
      allowed: false,
      reason: 'post_limit_reached',
      current,
      limit,
      inGrace: false,
    };
  }

  return { allowed: true, current, limit, inGrace };
}

module.exports = {
  getPlanConfig,
  getUserPlan,
  getUserPlanAsync,
  getPlanConfigAsync,
  countPropertiesForAgent,
  canCreateProperty,
  isInGrace,
};
