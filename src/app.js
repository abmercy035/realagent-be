const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { rateLimit } = require('express-rate-limit');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
	windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
	max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
	message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

// CORS configuration
app.use(cors({
	origin: process.env.FRONTEND_URL || 'http://localhost:3000',
	credentials: true,
}));

// Body parser middleware
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
