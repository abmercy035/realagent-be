const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const { issueTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { sendOTPEmail } = require('../utils/email');

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

const ACCESS_TOKEN_COOKIE = 'campusagent_access_token';
const REFRESH_TOKEN_COOKIE = 'campusagent_refresh_token';
const SESSION_INDICATOR_COOKIE = 'campusagent_session';

const IS_PROD = process.env.NODE_ENV === 'production';

// Cookie helper — mirrors frontend tokens.service.ts
function setAuthCookies(res, { accessToken, refreshToken }) {
  const cookieBase = { httpOnly: true, secure: IS_PROD, sameSite: IS_PROD ? 'none' : 'lax' };

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieBase,
    path: '/',
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...cookieBase,
    path: '/api/auth/refresh',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.cookie(SESSION_INDICATOR_COOKIE, '1', {
    ...cookieBase,
    httpOnly: false,
    path: '/',
    maxAge: 2 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  const cookieBase = { httpOnly: true, secure: IS_PROD, sameSite: IS_PROD ? 'none' : 'lax' };
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...cookieBase, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...cookieBase, path: '/api/auth/refresh' });
  res.clearCookie(SESSION_INDICATOR_COOKIE, { httpOnly: false, ...cookieBase, path: '/' });
}

 
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'No active session to refresh.' });
  }

  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }

  const user = await User.findById(claims.sub).select('globalRole role refreshTokenVersion status').lean();
  if (!user || user.status !== 'active' || (user.refreshTokenVersion || 0) !== claims.tokenVersion) {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }

  const tokens = issueTokenPair({
    userId: user._id.toString(),
    globalRole: user.globalRole || (user.role === 'admin' ? 'admin' : 'user'),
    tokenVersion: user.refreshTokenVersion || 0,
  });

  setAuthCookies(res, tokens);

  res.status(200).json({ success: true, message: 'Session refreshed.' });
});


router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        status: 'error',
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    console.log(user,email, password)

    if (!user) {
      return res.status(401).json({
        success: false,
        status: 'error',
        message: 'Invalid email or password.',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        status: 'error',
        message: `Account is ${user.status}. Please contact support.`,
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        status: 'error',
        message: 'Invalid email or password.',
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      // Generate and send OTP code
      const otp = user.generateOTP();
      await user.save();
      
      console.log(`[DEV] Generated login OTP for ${user.email}: ${otp}`);

      try {
        await sendOTPEmail(user.email, user.name || user.fullName, otp);
      } catch (emailError) {
        console.error('Failed to send login OTP email:', emailError);
      }

      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email before logging in. A 6-digit OTP code has been sent.',
      });
    }

    user.lastLogin = new Date();
    await user.save();

    console.log(user, 2)

    const tokens = issueTokenPair({
      userId: user._id.toString(),
      globalRole: user.globalRole || (user.role === 'admin' ? 'admin' : 'user'),
      tokenVersion: user.refreshTokenVersion || 0,
    });

    setAuthCookies(res, tokens);

    console.log(tokens, 3)

    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Logged in successfully.',
      data: {
        userId: user._id.toString(),
        user: user.toPublicProfile(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Login failed. Please try again.',
      error: error.message,
    });
  }
});

 
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        status: 'error',
        message: 'Full name, email, and password are required.',
      });
    }

    if (fullName.trim().length < 2 || fullName.trim().length > 100) {
      return res.status(400).json({
        success: false,
        status: 'error',
        message: 'Name must be between 2 and 100 characters.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        status: 'error',
        message: 'Password must be at least 6 characters.',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        status: 'error',
        message: 'An account with this email already exists. Try logging in instead.',
      });
    }

    const user = new User({
      name: fullName.trim(),
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      password,
      role: 'user',
      marketCreditBalance: 200,
      marketSellerTier: 'free',
      emailVerified: false, // Must verify email
    });

    // Generate verification OTP code
    const otp = user.generateOTP();
    await user.save();

    console.log(`[DEV] Generated registration OTP for ${user.email}: ${otp}`);

    // Send verification OTP email via Courier
    try {
      await sendOTPEmail(user.email, user.name || user.fullName, otp);
    } catch (emailError) {
      console.error('Failed to send verification OTP email:', emailError);
    }

    res.status(201).json({
      success: true,
      status: 'success',
      requiresVerification: true,
      message: 'Account created successfully. Please verify your email with the OTP code sent.',
      data: {
        userId: user._id.toString(),
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Registration failed. Please try again.',
      error: error.message,
    });
  }
});
 
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP code are required.',
      });
    }

    // Find user with otpCode and otpExpires fields selected
    const user = await User.findOne({ email: email.toLowerCase() }).select('+otpCode +otpExpires');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.',
      });
    }

    // Hash the input OTP code to compare with database
    const hashedOtp = crypto.createHash('sha256').update(otp.trim()).digest('hex');

    if (!user.otpCode || user.otpCode !== hashedOtp || !user.otpExpires || user.otpExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code. Please request a new one.',
      });
    }

    // Mark as verified and clear OTP fields
    user.emailVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    
    // Log user in
    user.lastLogin = new Date();
    await user.save();

    const tokens = issueTokenPair({
      userId: user._id.toString(),
      globalRole: user.globalRole || (user.role === 'admin' ? 'admin' : 'user'),
      tokenVersion: user.refreshTokenVersion || 0,
    });

    setAuthCookies(res, tokens);

    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Email verified and logged in successfully.',
      data: {
        userId: user._id.toString(),
        user: user.toPublicProfile(),
      },
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.',
      error: error.message,
    });
  }
});
 
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.',
      });
    }

    // Generate new OTP
    const otp = user.generateOTP();
    await user.save();

    console.log(`[DEV] Resent OTP for ${user.email}: ${otp}`);

    // Send OTP email
    try {
      await sendOTPEmail(user.email, user.name || user.fullName, otp);
    } catch (emailError) {
      console.error('Failed to send resent OTP email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'A new 6-digit OTP code has been sent.',
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send new OTP code. Please try again.',
      error: error.message,
    });
  }
});

 
router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  res.status(200).json({ success: true, status: 'success', message: 'Logged out successfully.' });
});

module.exports = router;
