/**
 * routes/authNew.js
 *
 * NEW auth routes migrated from the Next.js frontend.
 * These use the dual-token (access + refresh) cookie system.
 *
 * Migrated from:
 *   app/api/auth/google/route.ts
 *   app/api/auth/google/callback/route.ts
 *   app/api/auth/refresh/route.ts
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const { issueTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { sendOTPEmail } = require('../utils/email');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_OAUTH_CALLBACK_URL = process.env.GOOGLE_OAUTH_CALLBACK_URL;
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const OAUTH_STATE_COOKIE = 'campusagent_oauth_state';
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

// ---------------------------------------------------------------------------
// GET /api/auth/google — starts the Google OAuth flow
// ---------------------------------------------------------------------------
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_OAUTH_CALLBACK_URL) {
    return res.status(500).json({ status: 'error', message: 'Google OAuth not configured.' });
  }

  const state = crypto.randomBytes(24).toString('hex');

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', GOOGLE_OAUTH_CALLBACK_URL);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('access_type', 'online');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    path: '/api/auth/google',
    maxAge: 5 * 60 * 1000, // 5 minutes
  });

  res.redirect(googleAuthUrl.toString());
});

// ---------------------------------------------------------------------------
// GET /api/auth/google/callback — Google redirects here after consent
// ---------------------------------------------------------------------------
router.get('/google/callback', async (req, res) => {
  const { code, state: returnedState } = req.query;
  const storedState = req.cookies?.[OAUTH_STATE_COOKIE];

  if (!returnedState || !storedState || returnedState !== storedState) {
    return res.redirect(`${APP_URL}/login?error=invalid_state`);
  }

  if (!code) {
    return res.redirect(`${APP_URL}/login?error=missing_code`);
  }

  // Exchange the authorization code for Google's tokens
  let tokenResponse;
  try {
    tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_OAUTH_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });
  } catch (err) {
    console.error('Google token exchange network error:', err);
    return res.redirect(`${APP_URL}/login?error=token_exchange_failed`);
  }

  if (!tokenResponse.ok) {
    console.error('Google token exchange failed');
    return res.redirect(`${APP_URL}/login?error=token_exchange_failed`);
  }

  const tokens = await tokenResponse.json();

  // Fetch the Google profile
  let userInfoResponse;
  try {
    userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  } catch (err) {
    console.error('Google userinfo fetch network error:', err);
    return res.redirect(`${APP_URL}/login?error=userinfo_failed`);
  }

  if (!userInfoResponse.ok) {
    console.error('Google userinfo fetch failed');
    return res.redirect(`${APP_URL}/login?error=userinfo_failed`);
  }

  const profile = await userInfoResponse.json();

  // Find or create the user (account linking)
  let user = await User.findOne({ googleId: profile.sub });

  if (!user) {
    // Try linking by email
    user = await User.findOne({ email: profile.email.toLowerCase() });
    if (user) {
      user.googleId = profile.sub;
      if (!user.avatarUrl && profile.picture) {
        user.avatarUrl = profile.picture;
        user.avatar = profile.picture;
      }
      if (profile.email_verified && !user.emailVerifiedAt) {
        user.emailVerifiedAt = new Date();
      }
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        email: profile.email.toLowerCase(),
        googleId: profile.sub,
        fullName: profile.name,
        name: profile.name,
        avatarUrl: profile.picture,
        avatar: profile.picture,
        emailVerifiedAt: profile.email_verified ? new Date() : undefined,
        marketCreditBalance: 200,
        marketSellerTier: 'free',
        // No password for Google OAuth users
      });
    }
  }

  // Issue our JWT pair
  const tokenPair = issueTokenPair({
    userId: user._id.toString(),
    globalRole: user.globalRole || (user.role === 'admin' ? 'admin' : 'user'),
    tokenVersion: user.refreshTokenVersion || 0,
  });

  setAuthCookies(res, tokenPair);

  // Clear the now-consumed state cookie
  res.clearCookie(OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/api/auth/google',
  });

  res.redirect(`${APP_URL}/dashboard`);
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh — exchanges refresh token for fresh pair
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/auth/login — email/password login (dual-token cookie system)
// ---------------------------------------------------------------------------
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

    const tokens = issueTokenPair({
      userId: user._id.toString(),
      globalRole: user.globalRole || (user.role === 'admin' ? 'admin' : 'user'),
      tokenVersion: user.refreshTokenVersion || 0,
    });

    setAuthCookies(res, tokens);

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

// ---------------------------------------------------------------------------
// POST /api/auth/register — email/password registration (dual-token cookie system)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp — Verifies 6-digit OTP code and logs user in
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/auth/resend-otp — Generates and resends a new 6-digit OTP code
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/auth/logout — clears auth cookies (new system)
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  res.status(200).json({ success: true, status: 'success', message: 'Logged out successfully.' });
});

module.exports = router;
