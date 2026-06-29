require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

connectDB();

const server = app.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
	console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
	try {
		const { startPinger } = require('./src/utils/pinger');
		startPinger();
	} catch (err) {
		console.warn('Pinger utility failed to start:', err.message || err);
	}
});

process.on('unhandledRejection', (err) => {
	console.error('❌ Unhandled Promise Rejection:', err);
	server.close(() => process.exit(1));
});
process.on('uncaughtException', (err) => {
	console.error('❌ Uncaught Exception:', err);
	process.exit(1);
});
