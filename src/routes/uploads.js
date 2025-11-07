const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const cloudinary = require('../config/cloudinary').cloudinary;
const uploadLimiter = require('../middleware/uploadRateLimiter');

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

// POST /api/uploads/property-media - Updated to 6 images + 2 videos
router.post('/property-media', uploadLimiter, upload.fields([{ name: 'images', maxCount: 6 }, { name: 'videos', maxCount: 2 }]), async (req, res) => {
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
		if (req.files?.videos) {
			for (const f of req.files.videos) {
				try {
					const stat = fs.statSync(f.path);
					if (stat.size > MAX_VIDEO_SIZE) oversized.push({ field: 'video', name: f.originalname, size: stat.size });
				} catch (e) {
					console.error('Failed to stat video file', e);
				}
			}
		}

		if (oversized.length > 0) {
			// Cleanup temp files
			try {
				if (req.files?.images) req.files.images.forEach((f) => { try { fs.unlinkSync(f.path); } catch (e) { } });
				if (req.files?.videos) req.files.videos.forEach((f) => { try { fs.unlinkSync(f.path); } catch (e) { } });
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
				images.push({ url: result.secure_url, publicId: result.public_id, format: result.format, width: result.width, height: result.height, type: "image" });
				// removing temp file
				try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
			}
		}

		const videos = [];
		if (req.files?.videos) {
			for (const file of req.files.videos) {
				// Request an optimized MP4 AND a JPG thumbnail for the uploaded video.
				// The eager array returns entries for each transformation; we'll prefer a JPG eager (thumbnail)
				// for the poster image and the optimized mp4 for playback.
				const result = await cloudinary.uploader.upload(file.path, {
					folder: `agent/properties/${agentId}/${propertyId || 'temp'}`,
					resource_type: 'video',
					eager: [
						// optimized MP4 for playback
						{
							width: 720,
							crop: 'scale',
							quality: 'auto:eco',
							video_codec: 'auto',
							fps: '24',
							format: 'mp4',
						},
						// JPG thumbnail (single frame) to use as poster image
						{
							width: 720,
							height: 406,
							crop: 'fill',
							gravity: 'auto',
							fetch_format: 'auto',
							quality: 'auto',
							format: 'jpg',
						},
					],
				});

				// Find the optimized mp4 and jpg thumbnail in eager results if present
				const eagerList = Array.isArray(result.eager) ? result.eager : [];
				const optimized = eagerList.find(e => String(e.format).toLowerCase() === 'mp4') || result;
				const thumbnailItem = eagerList.find(e => ['jpg','jpeg','png'].includes(String(e.format).toLowerCase())) || null;

				let thumbnail = null;
				try {
					if (thumbnailItem && thumbnailItem.secure_url) {
						thumbnail = thumbnailItem.secure_url;
					} else {
						// Fallback: construct a Cloudinary-derived image snapshot from the uploaded video public_id
						// This uses Cloudinary's ability to serve a video frame as an image by requesting the video resource with an image format
						if (result && result.public_id) {
							try {
								// prefer center-crop thumbnail
								thumbnail = cloudinary.url(result.public_id, {
									resource_type: 'video',
									format: 'jpg',
									transformation: [
										{ width: 720, height: 406, crop: 'fill', gravity: 'auto' },
										{ quality: 'auto', fetch_format: 'auto' }
									],
									secure: true,
								});
							} catch (err) {
								// As a last resort, use the uploaded secure_url (may be video)
								thumbnail = result.secure_url;
							}
						}
					}
				} catch (err) {
					console.warn('Thumbnail generation fallback failed', err);
					thumbnail = result.secure_url;
				}

				const duration = (optimized && (optimized.duration || result.duration)) || null;
				videos.push({ url: optimized.secure_url, publicId: result.public_id, format: optimized.format || result.format, width: optimized.width, height: optimized.height, thumbnail, duration, type: "video" });
				try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
			}
		}

		console.log({ images, videos }, 111);
		return res.json({ images, videos });
	} catch (err) {
		console.error('Upload error:', err.message);
		return res.status(500).json({ error: 'Upload failed' });
	}
});

module.exports = router;
