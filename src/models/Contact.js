const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
	name: { type: String, required: true },
	email: { type: String, required: true },
	subject: { type: String },
	message: { type: String, required: true },
	phone: { type: String },
	ip: { type: String },
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
}, { timestamps: true });

module.exports = mongoose.model('Contact', ContactSchema);
