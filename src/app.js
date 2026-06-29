const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
	windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
	max: process.env.NODE_ENV === 'development'
		? 10000 // High limit in development to avoid HMR / page refresh blocks
		: (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100),
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		status: 'error',
		message: 'Too many requests from this IP, please try again later.',
		code: 'RATE_LIMIT_EXCEEDED',
	},
});
app.use('/api', limiter);

// CORS configuration
const allowedOrigins = [
	process.env.FRONTEND_URL || 'http://localhost:3000',
	'http://localhost:3001',
	'http://localhost:3002',
];

app.use(cors({
	origin: (origin, callback) => {
		// Allow requests with no origin (like mobile apps, curl, postman)
		if (!origin) return callback(null, true);
		
		if (
			allowedOrigins.includes(origin) || 
			(process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) ||
			origin.endsWith('.vercel.app') ||
			origin.endsWith('campusagent.app') ||
			origin === 'https://campusagent.app' ||
			origin === 'https://realagent.vercel.app' ||
			origin === 'https://campusagent.vercel.app'
		) {
			return callback(null, true);
		}
		
		return callback(new Error('Not allowed by CORS'));
	},
	credentials: true,
}));

// Cookie parser — REQUIRED for the dual-token auth system (Google OAuth, refresh, etc.)
// Without this, req.cookies is always undefined and all cookie-based auth fails.
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Webhook routes MUST be mounted BEFORE express.json() because Paystack
// webhooks need the raw request body for HMAC-SHA512 signature verification.
// express.json() consumes the stream, making raw body capture impossible.
// We mount a lightweight raw-body capture for just the webhook path.
// ---------------------------------------------------------------------------
app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), (req, res, next) => {
	// Store raw body for signature verification, then parse for downstream handlers
	if (req.body && Buffer.isBuffer(req.body)) {
		req.rawBody = req.body.toString('utf-8');
		try {
			req.body = JSON.parse(req.rawBody);
		} catch {
			req.body = {};
		}
	}
	next();
});

// Body parser middleware (for all non-webhook routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
	app.use(morgan('dev'));
}

// Health check route
app.get('/health', (req, res) => {
	res.status(200).json({
		status: 'success',
		message: 'CampusAgent API is running',
		timestamp: new Date().toISOString(),
	});
});

// API routes
const routes = require('./routes');
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
	res.status(404).json({
		status: 'error',
		message: 'Route not found',
	});
});

// Global error handler
app.use((err, req, res, next) => {
	console.error('Error:', err);

	// Mongoose validation error
	if (err.name === 'ValidationError') {
		const errors = Object.values(err.errors).map(e => e.message);
		return res.status(400).json({
			status: 'error',
			message: 'Validation failed',
			errors,
		});
	}

	// Mongoose duplicate key error
	if (err.code === 11000) {
		const field = Object.keys(err.keyPattern)[0];
		return res.status(409).json({
			status: 'error',
			message: `${field} already exists`,
		});
	}

	// JWT errors
	if (err.name === 'JsonWebTokenError') {
		return res.status(401).json({
			status: 'error',
			message: 'Invalid token',
		});
	}

	if (err.name === 'TokenExpiredError') {
		return res.status(401).json({
			status: 'error',
			message: 'Token expired',
		});
	}

	// Default error
	res.status(err.statusCode || 500).json({
		status: 'error',
		message: err.message || 'Internal server error',
		...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
	});
});

module.exports = app;
