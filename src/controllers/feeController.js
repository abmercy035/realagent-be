const { ROOMMATE_POST_FEE } = require('../utils/fees');

// Returns fee for roommate post (could be extended for other listing types)
exports.getRoommatePostFee = (req, res) => {
	res.json({ fee: ROOMMATE_POST_FEE });
};
