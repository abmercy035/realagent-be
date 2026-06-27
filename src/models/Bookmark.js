const mongoose = require('mongoose');
const { Schema } = mongoose;

// Generic Bookmark model supporting both users (agents/sellers) and products (market items)
const bookmarkSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // The type indicates what is being bookmarked: 'user' (agent/seller) or 'product' (market item)
  type: { type: String, enum: ['user', 'product'], required: true },
  // Reference to the target document. The ref is resolved dynamically via refPath.
  target: { type: Schema.Types.ObjectId, required: true, refPath: 'type' },
  // Optional note the user can add to the bookmark
  note: { type: String, trim: true, maxlength: 500 },
  // Optional tags for categorizing bookmarks
  tags: [{ type: String, trim: true, maxlength: 50 }],
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Index to ensure a user cannot bookmark the same target twice
bookmarkSchema.index({ user: 1, target: 1, type: 1 }, { unique: true });
bookmarkSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Bookmark', bookmarkSchema);
