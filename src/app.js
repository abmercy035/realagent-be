const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const app = express();
const routes = require('./routes');

// Security middleware
app.use(helmet());
// CORS configuration

// CORS configuration
app.use(cors({
	origin: [
		process.env.FRONTEND_URL,
		'https://campusagent.app',
		'http://localhost:3001',
	].filter((origin) => Boolean(origin)),
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
	exposedHeaders: ['Set-Cookie']
}));

app.use(cookieParser());

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
app.use('/api', routes);

app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), (req, res, next) => {
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'production') {
	app.use(morgan('dev'));
}



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
