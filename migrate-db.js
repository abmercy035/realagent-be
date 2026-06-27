/**
 * migrate-db.js
 * 
 * Script to migrate existing database documents to the updated schema definitions.
 * Connects to MongoDB, updates the collections:
 *   1. 'users': Ensures new fields like marketCreditBalance, marketSellerTier, globalRole are set. Syncs name <-> fullName, avatar <-> avatarUrl.
 *   2. 'marketitems' -> 'marketlistings': Migrates legacy market item docs to the new marketlistings schema format.
 *   3. 'properties': Migrates legacy property docs to the updated properties schema format.
 */

require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/realagent';

console.log('Connecting to database:', MONGODB_URI);

async function runMigration() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // ==========================================
    // 1. MIGRATE USERS COLLECTION
    // ==========================================
    console.log('\n--- Migrating Users ---');
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({}).toArray();
    console.log(`Found ${users.length} users to inspect.`);

    let updatedUsersCount = 0;
    for (const user of users) {
      const updates = {};

      // Sync name <-> fullName
      if (!user.name && user.fullName) {
        updates.name = user.fullName;
      }
      if (user.name && !user.fullName) {
        updates.fullName = user.name;
      }

      // Sync avatar <-> avatarUrl
      if (!user.avatar && user.avatarUrl) {
        updates.avatar = user.avatarUrl;
      }
      if (user.avatar && !user.avatarUrl) {
        updates.avatarUrl = user.avatar;
      }

      // Sync role <-> globalRole
      if (!user.globalRole) {
        updates.globalRole = user.role === 'admin' ? 'admin' : 'user';
      }
      if (user.globalRole === 'admin' && user.role !== 'admin') {
        updates.role = 'admin';
      }

      // Sync market fields
      if (typeof user.marketCreditBalance === 'undefined') {
        updates.marketCreditBalance = 200;
      }
      if (typeof user.marketSellerTier === 'undefined') {
        updates.marketSellerTier = 'free';
      }

      if (Object.keys(updates).length > 0) {
        await usersCollection.updateOne({ _id: user._id }, { $set: updates });
        updatedUsersCount++;
      }
    }
    console.log(`✅ Migrated ${updatedUsersCount} user documents.`);


    // ==========================================
    // 2. MIGRATE MARKETITEMS -> MARKETLISTINGS
    // ==========================================
    console.log('\n--- Migrating Market Listings ---');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    let legacyItems = [];
    if (collectionNames.includes('marketitems')) {
      legacyItems = await db.collection('marketitems').find({}).toArray();
      console.log(`Found ${legacyItems.length} legacy items in 'marketitems' collection.`);
    } else {
      console.log(`No legacy 'marketitems' collection found.`);
    }

    const marketlistingsCollection = db.collection('marketlistings');

    let migratedMarketCount = 0;
    for (const item of legacyItems) {
      // Check if already migrated (by checking if _id exists in marketlistings)
      const exists = await marketlistingsCollection.findOne({ _id: item._id });
      if (exists) {
        console.log(`Listing ${item._id} already migrated.`);
        continue;
      }

      // Map legacy schema to new schema
      const sellerId = item.owner || item.sellerId;
      if (!sellerId) {
        console.warn(`⚠️ Skipping item ${item._id} - missing owner/sellerId`);
        continue;
      }

      const priceAmount = typeof item.price === 'number' 
        ? item.price 
        : (item.price?.amount || 0);

      const campus = item.campus || item.school || 'Unknown Campus';

      const media = [];
      if (item.images && Array.isArray(item.images)) {
        item.images.forEach(img => {
          media.push({
            cloudinaryPublicId: img.publicId || '',
            secureUrl: img.url || '',
            type: 'image'
          });
        });
      }

      // Map status
      let status = 'active';
      if (item.status === 'deleted' || item.status === 'removed') {
        status = 'removed';
      } else if (item.status === 'closed' || item.status === 'sold') {
        status = 'sold';
      }

      // Default CreditCostBreakdown
      const creditCostCharged = item.creditCostCharged || {
        imageCost: 0,
        videoCost: 0,
        priceCost: 0,
        rawTotal: 0,
        finalCost: 0,
        capped: false
      };

      const newItem = {
        _id: item._id,
        sellerId: sellerId,
        title: item.title || 'Untitled Listing',
        description: item.description || '',
        price: priceAmount,
        category: item.category || 'other',
        campus: campus,
        media: media,
        status: status,
        creditCostCharged: creditCostCharged,
        sellerTierAtCreation: item.sellerTierAtCreation || 'free',
        createdAt: item.createdAt || new Date(),
        updatedAt: item.updatedAt || new Date()
      };

      await marketlistingsCollection.insertOne(newItem);
      migratedMarketCount++;
    }
    console.log(`✅ Migrated ${migratedMarketCount} market listing documents into 'marketlistings'.`);


    // ==========================================
    // 3. MIGRATE PROPERTIES COLLECTION
    // ==========================================
    console.log('\n--- Migrating Properties ---');
    const propertiesCollection = db.collection('properties');
    const properties = await propertiesCollection.find({}).toArray();
    console.log(`Found ${properties.length} properties to inspect.`);

    let updatedPropertiesCount = 0;
    for (const prop of properties) {
      const updates = {};
      const unset = {};

      // agentId <- agent
      if (!prop.agentId && prop.agent) {
        updates.agentId = prop.agent;
        unset.agent = "";
      }

      // price <- pricing.amount
      if (typeof prop.price === 'undefined' && prop.pricing) {
        updates.price = prop.pricing.amount || 0;
        
        // priceUnit <- pricing.period
        let unit = 'per_year';
        if (prop.pricing.period) {
          const p = String(prop.pricing.period).toLowerCase();
          if (p === 'per-month') unit = 'per_month';
          else if (p === 'per-year') unit = 'per_year';
          else if (p === 'one-time') unit = 'one_time';
        }
        updates.priceUnit = unit;
        unset.pricing = "";
      }

      // propertyType normalization
      if (prop.propertyType) {
        const t = String(prop.propertyType).toLowerCase();
        let newType = t;
        if (t === 'self-con') newType = 'self_contain';
        else if (t === 'a-room') newType = 'room';
        else if (t === 'shared-apartment') newType = 'shared_room';
        else if (t === 'flat') newType = 'apartment';
        
        if (newType !== prop.propertyType) {
          updates.propertyType = newType;
        }
      }

      // bedrooms / bathrooms conversion to Number
      if (prop.details) {
        if (typeof prop.bedrooms === 'undefined' && prop.details.bedrooms) {
          const br = parseInt(prop.details.bedrooms, 10);
          if (!isNaN(br)) updates.bedrooms = br;
        }
        if (typeof prop.bathrooms === 'undefined' && prop.details.bathrooms) {
          const ba = parseInt(prop.details.bathrooms, 10);
          if (!isNaN(ba)) updates.bathrooms = ba;
        }
        unset.details = "";
      }

      // location normalization (campus)
      if (prop.location) {
        if (!prop.location.campus && prop.location.school) {
          updates['location.campus'] = prop.location.school;
          unset['location.school'] = "";
        }
      }

      // media conversion to flat array
      if (prop.media && !Array.isArray(prop.media)) {
        const flatMedia = [];
        if (Array.isArray(prop.media.images)) {
          prop.media.images.forEach(img => {
            flatMedia.push({
              cloudinaryPublicId: img.publicId || '',
              secureUrl: img.url || '',
              type: 'image'
            });
          });
        }
        if (Array.isArray(prop.media.videos)) {
          prop.media.videos.forEach(vid => {
            flatMedia.push({
              cloudinaryPublicId: vid.publicId || '',
              secureUrl: vid.url || '',
              type: 'video'
            });
          });
        }
        updates.media = flatMedia;
      }

      // status mapping
      if (prop.status) {
        const s = String(prop.status).toLowerCase();
        if (s === 'archived' || s === 'deleted') {
          updates.status = s;
        } else if (s !== 'active') {
          updates.status = 'active';
        }
      }

      // slotMode / confirmationMode defaults
      if (!prop.slotMode) {
        updates.slotMode = 'exclusive';
      }
      if (!prop.confirmationMode) {
        updates.confirmationMode = 'manual';
      }
      if (!prop.availabilitySlots) {
        updates.availabilitySlots = [];
      }

      // Perform update
      const updatePayload = {};
      if (Object.keys(updates).length > 0) {
        updatePayload.$set = updates;
      }
      if (Object.keys(unset).length > 0) {
        updatePayload.$unset = unset;
      }

      if (Object.keys(updatePayload).length > 0) {
        await propertiesCollection.updateOne({ _id: prop._id }, updatePayload);
        updatedPropertiesCount++;
      }
    }
    console.log(`✅ Migrated ${updatedPropertiesCount} property documents.`);

    console.log('\n🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Error running migration:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

runMigration();
