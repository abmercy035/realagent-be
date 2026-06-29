require('dotenv').config();
const express = require('express')
const app = express();
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;
connectDB();


app.use("/", (req, res)=> {
	res.send("Welcome to Campus Agent API");
})


const server = app.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
	try {
		console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
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
