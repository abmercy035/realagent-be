const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const cloudinary = require('../config/cloudinary').cloudinary;

// ensuring tmp folder exists
const tmpDir = path.join(__dirname, '..', '..', 'tmp', 'uploads');
fs.mkdirSync(tmpDir, { recursive: true });

// Limits
const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB
const MAX_VIDEO_SIZE = 30 * 1024 * 1024; // 30MB
const GLOBAL_MAX_FILE_SIZE = MAX_VIDEO_SIZE; // highest per-file cap

const upload = multer({
	dest: tmpDir,
	limits: { fileSize: GLOBAL_MAX_FILE_SIZE },
	fileFilter: (req, file, cb) => {
		// Only allow image/* and video/* MIME types
		if (file.mimetype && (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'))) {
			cb(null, true);
		} else {
			cb(new Error('Invalid file type. Only images and videos are allowed.'));
		}
	},
});

// POST /api/uploads/property-media
router.post('/property-media', upload.fields([{ name: 'images', maxCount: 4 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
	try {
		const agentId = req.body.agentId || req.user?.id || 'agent-1';
		const propertyId = req.body.propertyId || null;

		// Server-side: validate file sizes per-field (images smaller cap, videos larger). If any file violates, delete temps and return 400.
		const oversized = [];
		if (req.files?.images) {
			for (const f of req.files.images) {
				try {
					const stat = fs.statSync(f.path);
					if (stat.size > MAX_IMAGE_SIZE) oversized.push({ field: 'image', name: f.originalname, size: stat.size });
				} catch (e) {
					console.error('Failed to stat image file', e);
				}
			}
		}
		if (req.files?.video && req.files.video[0]) {
			const f = req.files.video[0];
			try {
				const stat = fs.statSync(f.path);
				if (stat.size > MAX_VIDEO_SIZE) oversized.push({ field: 'video', name: f.originalname, size: stat.size });
			} catch (e) {
				console.error('Failed to stat video file', e);
			}
		}

		if (oversized.length > 0) {
			// Cleanup temp files
			try {
				if (req.files?.images) req.files.images.forEach((f) => { try { fs.unlinkSync(f.path); } catch (e) { } });
				if (req.files?.video) req.files.video.forEach((f) => { try { fs.unlinkSync(f.path); } catch (e) { } });
			} catch (e) { /* ignore */ }
			const details = oversized.map(o => `${o.field}:${o.name} (${Math.round(o.size / 1024)}KB)`).join(', ');
			return res.status(400).json({ error: `One or more files exceed allowed size limits: ${details}` });
		}

		const images = [];
		if (req.files?.images) {
			for (const file of req.files.images) {
				const result = await cloudinary.uploader.upload(file.path, {
					folder: `agent/properties/${agentId}/${propertyId || 'temp'}`,
					resource_type: 'image',
					transformation: [{ quality: 'auto', fetch_format: 'auto' }],
				});
				images.push({ url: result.secure_url, publicId: result.public_id, format: result.format, width: result.width, height: result.height });
				// removing temp file
				try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
			}
		}

		const videos = [];
		if (req.files?.video && req.files.video[0]) {
			const file = req.files.video[0];
			const result = await cloudinary.uploader.upload(file.path, {
				folder: `agent/properties/${agentId}/${propertyId || 'temp'}`,
				resource_type: 'video',
				eager: [
					{
						width: 720,
						crop: 'scale',
						quality: 'auto:eco',
						video_codec: 'auto',
						fps: '24',
						format: 'mp4',
					},
				],
			});

			const optimized = result.eager && result.eager[0] ? result.eager[0] : result;
			// Attempt to extract thumbnail and duration (if available)
			const thumbnail = optimized.secure_url || result.secure_url;
			const duration = optimized.duration || result.duration || null;
			videos.push({ url: optimized.secure_url, publicId: result.public_id, format: optimized.format || result.format, width: optimized.width, height: optimized.height, thumbnail, duration });
			try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
		}

		console.log({ images, videos });
		return res.json({ images, videos });
	} catch (err) {
		console.error('Upload error:', err);
		return res.status(500).json({ error: 'Upload failed' });
	}
});

module.exports = router;
