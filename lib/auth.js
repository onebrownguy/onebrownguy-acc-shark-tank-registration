/* ****************************************
 * Iron Session Authentication Configuration
 * Centralized session management for ACC Shark Tank admin system
 * 
 * @author ACC Development Team (Abel)
 * @version 1.0
 * @date July 2025
 * @note Requires SESSION_SECRET environment variable (32+ character string)
 * @note Uses secure cookie settings for production deployment
 ****************************************/

const { withIronSessionApiRoute } = require('iron-session');

/**
 * Iron Session configuration object
 * @type {object}
 */
const sessionOptions = {
    password: process.env.SESSION_SECRET || 'dev-secret-key-replace-in-production-with-32-chars-min',
    cookieName: 'acc-shark-tank-session',
    cookieOptions: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true, // Prevent XSS attacks
        maxAge: 60 * 60 * 24 * 7, // 7 days
        sameSite: 'strict', // CSRF protection
        path: '/', // Available on all routes
    },
};

/**
 * Wrapper function to add Iron Session to API routes
 * @param {Function} handler - The API route handler function
 * @returns {Function} Enhanced handler with session support
 */
function withSessionRoute(handler) {
    return withIronSessionApiRoute(handler, sessionOptions);
}

/**
 * Middleware to check if user is authenticated
 * @param {object} req - Request object with session
 * @param {object} res - Response object
 * @param {Function} next - Next middleware function (optional for API routes)
 * @returns {boolean} True if authenticated, false otherwise
 */
function requireAuth(req, res, next) {
    const user = req.session?.user;
    
    if (!user || !user.email) {
        if (res) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'UNAUTHORIZED' 
            });
        }
        return false;
    }
    
    // Attach user to request for convenience
    req.user = user;
    
    if (next) {
        return next();
    }
    
    return true;
}

/**
 * Middleware to check if user has admin privileges
 * @param {object} req - Request object with session
 * @param {object} res - Response object
 * @param {Function} next - Next middleware function (optional for API routes)
 * @returns {boolean} True if admin, false otherwise
 */
function requireAdmin(req, res, next) {
    const user = req.session?.user;
    
    if (!user || !user.email) {
        if (res) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'UNAUTHORIZED' 
            });
        }
        return false;
    }
    
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        if (res) {
            return res.status(403).json({ 
                error: 'Admin privileges required',
                code: 'FORBIDDEN' 
            });
        }
        return false;
    }
    
    // Attach user to request for convenience
    req.user = user;
    
    if (next) {
        return next();
    }
    
    return true;
}

/**
 * Get current user from session
 * @param {object} req - Request object with session
 * @returns {object|null} User object or null if not authenticated
 */
function getCurrentUser(req) {
    return req.session?.user || null;
}

/**
 * Login user and create session
 * @param {object} req - Request object with session
 * @param {object} userData - User data to store in session
 * @returns {Promise<void>}
 */
async function loginUser(req, userData) {
    req.session.user = {
        email: userData.email,
        role: userData.role,
        name: userData.name,
        loginTime: new Date().toISOString()
    };
    
    await req.session.save();
}

/**
 * Logout user and destroy session
 * @param {object} req - Request object with session
 * @returns {Promise<void>}
 */
async function logoutUser(req) {
    req.session.destroy();
}

/**
 * Validate session secret is properly configured
 * @throws {Error} If session secret is missing or too short
 */
function validateSessionConfig() {
    const secret = process.env.SESSION_SECRET;
    
    if (!secret) {
        throw new Error('SESSION_SECRET environment variable is required');
    }
    
    if (secret.length < 32) {
        console.warn('SESSION_SECRET should be at least 32 characters for security');
    }
    
    if (process.env.NODE_ENV === 'production' && secret.includes('dev-secret')) {
        throw new Error('Production SESSION_SECRET must not contain default development values');
    }
}

// Validate configuration on module load
try {
    validateSessionConfig();
} catch (error) {
    console.error('Session configuration error:', error.message);
    if (process.env.NODE_ENV === 'production') {
        throw error;
    }
}

module.exports = {
    sessionOptions,
    withSessionRoute,
    requireAuth,
    requireAdmin,
    getCurrentUser,
    loginUser,
    logoutUser,
    validateSessionConfig
};