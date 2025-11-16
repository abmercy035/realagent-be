/**
 * Credits configuration
 * Central place to manage credit pricing and deduction rules
 */

module.exports = {
  // Initial credits given to new users on registration
  initialCredits: 10,

  // Credit packages available for purchase
  packages: [
    {
      id: 'package-200',
      name: 'Starter Pack',
      price: 200,
      credits: 5,
      currency: 'NGN',
      description: '5 credits - Good for 1-2 property listings',
    },
    {
      id: 'package-400',
      name: 'Standard Pack',
      price: 400,
      credits: 12,
      currency: 'NGN',
      description: '12 credits - Good for 3-6 property listings',
      popular: true,
    },
    {
      id: 'package-600',
      name: 'Premium Pack',
      price: 600,
      credits: 20,
      currency: 'NGN',
      description: '20 credits - Good for 5-10 property listings',
    },
  ],

  // Credit deduction rules
  costs: {
    propertyListing: 4,
    itemListing: 2,
  },

  // Minimum credits required to perform actions
  minimumCredits: {
    propertyListing: 4,
    itemListing: 2,
  },
};
