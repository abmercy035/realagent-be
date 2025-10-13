require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Start server
const server = app.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
	console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
	console.error('❌ Unhandled Promise Rejection:', err);
	server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
	console.error('❌ Uncaught Exception:', err);
	process.exit(1);
});
