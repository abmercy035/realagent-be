/**
	* Credit Controller
	* Handles credit purchases, transactions, and balance management
	*/

const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const creditsConfig = require('../config/credits');
const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';
const PAYSTACK_VERIFY_URL = 'https://api.paystack.co/transaction/verify';

/**
	* @route   GET /api/credits/balance
	* @desc    Get user's current credit balance
	* @access  Private
	*/
exports.getBalance = async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select('credits totalCreditsEarned totalCreditsSpent');

		console.log(user)
		if (!user) {
			return res.status(404).json({ success: false, error: 'User not found' });
		}
		res.json({
			success: true,
			data: {
				balance: user.credits,
				totalEarned: user.totalCreditsEarned,
				totalSpent: user.totalCreditsSpent,
			},
		});
	} catch (error) {
		console.error('Get balance error:', error);
		res.status(500).json({ success: false, error: 'Failed to fetch credit balance' });
	}
};

/**
	* @route   GET /api/credits/packages
	* @desc    Get available credit packages
	* @access  Public
	*/
exports.getPackages = async (req, res) => {
	try {
		res.json({
			success: true,
			data: creditsConfig.packages,
		});
	} catch (error) {
		console.error('Get packages error:', error);
		res.status(500).json({ success: false, error: 'Failed to fetch credit packages' });
	}
};

/**
	* @route   GET /api/credits/transactions
	* @desc    Get user's credit transaction history
	* @access  Private
	*/
exports.getTransactions = async (req, res) => {
	try {
		const page = parseInt(req.query.page, 10) || 1;
		const limit = parseInt(req.query.limit, 10) || 20;
		const skip = (page - 1) * limit;

		const filter = { user: req.user._id };

		// Filter by transaction type if provided
		if (req.query.type) {
			filter.type = req.query.type;
		}

		const [transactions, total] = await Promise.all([
			CreditTransaction.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean(),
			CreditTransaction.countDocuments(filter),
		]);

		const pages = Math.ceil(total / limit) || 1;

		res.json({
			success: true,
			data: transactions,
			pagination: {
				page,
				limit,
				total,
				pages,
			},
		});
	} catch (error) {
		console.error('Get transactions error:', error);
		res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
	}
};

/**
	* @route   POST /api/credits/purchase/initialize
	* @desc    Initialize credit purchase (create payment intent)
	* @access  Private
	*/
exports.initializePurchase = async (req, res) => {
	try {
		const { packageId } = req.body;

		if (!packageId) {
			return res.status(400).json({ success: false, error: 'Package ID is required' });
		}

		// Find the package
		const selectedPackage = creditsConfig.packages.find(pkg => pkg.id === packageId);

		if (!selectedPackage) {
			return res.status(404).json({ success: false, error: 'Package not found' });
		}

		const user = await User.findById(req.user._id);

		if (!user) {
			return res.status(404).json({ success: false, error: 'User not found' });
		}

		if (!user.email) {
			return res.status(400).json({ success: false, error: 'User email is required for payment' });
		}

		// Generate unique reference
		const reference = `CREDIT_${Date.now()}_${user._id}`;

		// Create a pending transaction record
		const transaction = await CreditTransaction.create({
			user: user._id,
			type: 'purchase',
			amount: selectedPackage.credits,
			balanceBefore: user.credits,
			balanceAfter: user.credits, // Will be updated on verification
			description: `Purchase of ${selectedPackage.name}`,
			package: {
				id: selectedPackage.id,
				name: selectedPackage.name,
				price: selectedPackage.price,
				currency: selectedPackage.currency,
			},
			payment: {
				provider: 'paystack',
				reference,
				status: 'pending',
			},
		});

		// Initialize Paystack payment
		if (!PAYSTACK_SECRET) {
			return res.status(500).json({ success: false, error: 'Payment provider not configured' });
		}

		const paystackPayload = {
			email: user.email,
			amount: Math.round(selectedPackage.price * 100), // Convert to kobo
			reference,
			metadata: {
				userId: user._id.toString(),
				transactionId: transaction._id.toString(),
				packageId: selectedPackage.id,
				credits: selectedPackage.credits,
				type: 'credit_purchase',
			},
			callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/${user.role}/credits?reference=${reference}`,
		};

		const paystackResponse = await axios.post(PAYSTACK_INIT_URL, paystackPayload, {
			headers: {
				Authorization: `Bearer ${PAYSTACK_SECRET}`,
				'Content-Type': 'application/json',
			},
		});

		if (!paystackResponse.data || !paystackResponse.data.status) {
			return res.status(502).json({ success: false, error: 'Failed to initialize payment' });
		}

		res.json({
			success: true,
			data: {
				reference,
				amount: selectedPackage.price,
				currency: selectedPackage.currency,
				credits: selectedPackage.credits,
				transactionId: transaction._id,
				authorizationUrl: paystackResponse.data.data.authorization_url,
				accessCode: paystackResponse.data.data.access_code,
			},
		});
	} catch (error) {
		console.error('Initialize purchase error:', error?.response?.data || error);
		res.status(500).json({ success: false, error: 'Failed to initialize purchase' });
	}
};

/**
	* @route   POST /api/credits/purchase/verify
	* @desc    Verify payment and credit user's account
	* @access  Private
	*/
exports.verifyPurchase = async (req, res) => {
	try {
		const { reference } = req.body;

		console.log('🔍 Verifying payment - Reference:', reference, 'User:', req.user._id);

		if (!reference) {
			console.log('❌ No reference provided');
			return res.status(400).json({ success: false, error: 'Payment reference is required' });
		}

		// Find the transaction
		const transaction = await CreditTransaction.findOne({
			'payment.reference': reference,
			user: req.user._id,
		});

		console.log('📄 Transaction found:', transaction ? 'Yes' : 'No');

		if (!transaction) {
			console.log('❌ Transaction not found for reference:', reference);
			return res.status(404).json({ success: false, error: 'Transaction not found' });
		}

		if (transaction.payment.status === 'success') {
			console.log('✅ Transaction already verified');
			return res.json({
				success: true,
				message: 'Transaction already verified',
				data: {
					balance: (await User.findById(req.user._id)).credits,
					creditsAdded: transaction.amount,
				},
			});
		}

		// Verify payment with Paystack
		if (!PAYSTACK_SECRET) {
			console.log('❌ Paystack not configured');
			return res.status(500).json({ success: false, error: 'Payment provider not configured' });
		}

		console.log('🔄 Verifying with Paystack...');
		const paystackResponse = await axios.get(`${PAYSTACK_VERIFY_URL}/${reference}`, {
			headers: {
				Authorization: `Bearer ${PAYSTACK_SECRET}`,
			},
		});

		console.log('📥 Paystack response:', paystackResponse.data);

		if (!paystackResponse.data || !paystackResponse.data.status) {
			console.log('❌ Invalid Paystack response');
			return res.status(502).json({ success: false, error: 'Failed to verify payment' });
		}

		const paymentData = paystackResponse.data.data;

		if (paymentData.status !== 'success') {
			console.log('❌ Payment not successful:', paymentData.status);
			return res.status(400).json({ success: false, error: 'Payment verification failed' });
		}

		// For demo purposes, we'll assume verification succeeded
		const user = await User.findById(req.user._id);

		if (!user) {
			console.log('❌ User not found');
			return res.status(404).json({ success: false, error: 'User not found' });
		}

		console.log('💰 Adding credits to user account...');
		// Credit the user's account
		const result = await user.addCredits(
			transaction.amount,
			'purchase',
			transaction.description,
			{
				package: transaction.package,
				payment: {
					...transaction.payment,
					status: 'success',
					paidAt: new Date(),
				},
			}
		);

		// Update the original transaction record
		transaction.payment.status = 'success';
		transaction.payment.paidAt = new Date();
		transaction.balanceAfter = result.balance;
		await transaction.save();

		console.log('✅ Successfully added', transaction.amount, 'credits. New balance:', result.balance);

		res.json({
			success: true,
			message: `Successfully added ${transaction.amount} credits to your account`,
			data: {
				balance: result.balance,
				creditsAdded: transaction.amount,
			},
		});
	} catch (error) {
		console.error('❌ Verify purchase error:', error);
		res.status(500).json({ success: false, error: 'Failed to verify purchase' });
	}
};

/**
	* @route   GET /api/credits/costs
	* @desc    Get credit costs for different actions
	* @access  Public
	*/
exports.getCosts = async (req, res) => {
	try {
		res.json({
			success: true,
			data: creditsConfig.costs,
		});
	} catch (error) {
		console.error('Get costs error:', error);
		res.status(500).json({ success: false, error: 'Failed to fetch credit costs' });
	}
};
