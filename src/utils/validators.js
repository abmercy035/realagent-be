/**
	* Input Validation Utilities
	* Validate user inputs for authentication and other operations
	*/

/**
	* Validate email format
	* @param {String} email
	* @returns {Boolean}
	*/
const isValidEmail = (email) => {
	const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
	return emailRegex.test(email);
};

/**
	* Validate password strength
	* @param {String} password
	* @returns {Object} { isValid, message }
	*/
const validatePassword = (password) => {
	if (!password) {
		return { isValid: false, message: 'Password is required' };
	}

	if (password.length < 6) {
		return { isValid: false, message: 'Password must be at least 6 characters' };
	}

	if (password.length > 100) {
		return { isValid: false, message: 'Password cannot exceed 100 characters' };
	}

	// Optional: Add more strict password requirements
	// const hasUpperCase = /[A-Z]/.test(password);
	// const hasLowerCase = /[a-z]/.test(password);
	// const hasNumber = /[0-9]/.test(password);
	// const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

	return { isValid: true, message: 'Password is valid' };
};

/**
	* Validate phone number
	* @param {String} phone
	* @returns {Boolean}
	*/
const isValidPhone = (phone) => {
	if (!phone) return true; // Phone is optional
	const phoneRegex = /^[0-9]{10,15}$/;
	return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

/**
	* Validate registration input
	* @param {Object} data - { name, email, password, phone, role }
	* @returns {Object} { isValid, errors }
	*/
const validateRegistration = (data) => {
	const errors = [];

	// Name validation
	if (!data.name || data.name.trim().length < 2) {
		errors.push('Name must be at least 2 characters');
	}

	if (data.name && data.name.length > 100) {
		errors.push('Name cannot exceed 100 characters');
	}

	// Email validation
	if (!data.email) {
		errors.push('Email is required');
	} else if (!isValidEmail(data.email)) {
		errors.push('Invalid email format');
	}

	// Password validation
	const passwordCheck = validatePassword(data.password);
	if (!passwordCheck.isValid) {
		errors.push(passwordCheck.message);
	}

	// Phone validation
	if (data.phone && !isValidPhone(data.phone)) {
		errors.push('Invalid phone number format');
	}

	// Role validation
	if (data.role && !['user', 'agent', 'admin'].includes(data.role)) {
		errors.push('Invalid role. Must be user, agent, or admin');
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
};

/**
	* Validate login input
	* @param {Object} data - { email, password }
	* @returns {Object} { isValid, errors }
	*/
const validateLogin = (data) => {
	const errors = [];

	if (!data.email) {
		errors.push('Email is required');
	} else if (!isValidEmail(data.email)) {
		errors.push('Invalid email format');
	}

	if (!data.password) {
		errors.push('Password is required');
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
};

/**
	* Sanitize user input (remove dangerous characters)
	* @param {String} input
	* @returns {String}
	*/
const sanitizeInput = (input) => {
	if (typeof input !== 'string') return input;
	return input.trim().replace(/[<>]/g, '');
};

module.exports = {
	isValidEmail,
	validatePassword,
	isValidPhone,
	validateRegistration,
	validateLogin,
	sanitizeInput,
};
