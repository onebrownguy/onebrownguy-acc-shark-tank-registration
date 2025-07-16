/* ****************************************
 * Iron Session Authentication Configuration
 * Centralized session management for ACC Shark Tank admin system
 * 
 * @author ACC Development Team (Abel)
 * @version 1.1
 * @date July 2025
 * @note Requires SESSION_SECRET environment variable (32+ character string)
 * @note Uses secure cookie settings for production deployment
 ****************************************/

const { withIronSessionApiRoute } = require('iron-session/api-route');

/**
 * Security configuration constants
 */
const SECURITY_CONFIG = {
    MIN_SECRET_LENGTH: 32,
    SESSION_DURATION: {
        development: 60 * 60 * 24 * 7, // 7 days in dev
        production: 60 * 60 * 8        // 8 hours in production
    },
    ALLOWED_ROLES: ['admin', 'superadmin', 'user'],
    COOKIE_SETTINGS: {
        development: {
            secure: false,
            sameSite: 'lax'
        },
        production: {
            secure: true,
            sameSite: 'strict'
        }
    }
};

/**
 * Get environment-specific session duration
 * @returns {number} Session duration in seconds
 */
function getSessionDuration() {
    const env = process.env.NODE_ENV || 'development';
    return SECURITY_CONFIG.SESSION_DURATION[env] || SECURITY_CONFIG.SESSION_DURATION.development;
}

/**
 * Get environment-specific cookie settings
 * @returns {object} Cookie configuration object
 */
function getCookieSettings() {
    const env = process.env.NODE_ENV || 'development';
    const baseSettings = SECURITY_CONFIG.COOKIE_SETTINGS[env];
    
    return {
        secure: baseSettings.secure,
        httpOnly: true,
        maxAge: getSessionDuration(),
        sameSite: baseSettings.sameSite,
        path: '/',
        // Add domain in production if needed
        ...(env === 'production' && process.env.COOKIE_DOMAIN && {
            domain: process.env.COOKIE_DOMAIN
        })
    };
}

/**
 * Iron Session configuration object
 * @type {object}
 */
const sessionOptions = {
    password: process.env.SESSION_SECRET || 'dev-secret-key-replace-in-production-with-32-chars-min',
    cookieName: 'nest-fest-session', // Updated from shark-tank
    cookieOptions: getCookieSettings(),
    // Add additional security options
    ttl: getSessionDuration(),
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
 * Enhanced middleware to check if user is authenticated
 * @param {object} req - Request object with session
 * @param {object} res - Response object
 * @param {Function} next - Next middleware function (optional for API routes)
 * @returns {boolean} True if authenticated, false otherwise
 */
function requireAuth(req, res, next) {
    try {
        const user = req.session?.user;
        
        if (!user || !user.email) {
            if (res) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    code: 'UNAUTHORIZED',
                    timestamp: new Date().toISOString()
                });
            }
            return false;
        }

        // Check if session has expired (additional check)
        if (user.loginTime) {
            const loginTime = new Date(user.loginTime);
            const now = new Date();
            const sessionAge = (now - loginTime) / 1000; // in seconds
            
            if (sessionAge > getSessionDuration()) {
                if (res) {
                    return res.status(401).json({ 
                        error: 'Session expired',
                        code: 'SESSION_EXPIRED',
                        timestamp: new Date().toISOString()
                    });
                }
                return false;
            }
        }

        // Validate user role
        if (user.role && !SECURITY_CONFIG.ALLOWED_ROLES.includes(user.role)) {
            console.warn(`Invalid role detected: ${user.role} for user: ${user.email}`);
            if (res) {
                return res.status(403).json({ 
                    error: 'Invalid role',
                    code: 'INVALID_ROLE',
                    timestamp: new Date().toISOString()
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
    } catch (error) {
        console.error('Authentication middleware error:', error);
        if (res) {
            return res.status(500).json({ 
                error: 'Authentication error',
                code: 'AUTH_ERROR',
                timestamp: new Date().toISOString()
            });
        }
        return false;
    }
}

/**
 * Enhanced middleware to check if user has admin privileges
 * @param {object} req - Request object with session
 * @param {object} res - Response object
 * @param {Function} next - Next middleware function (optional for API routes)
 * @returns {boolean} True if admin, false otherwise
 */
function requireAdmin(req, res, next) {
    try {
        // First check authentication
        if (!requireAuth(req, res)) {
            return false; // Response already sent
        }

        const user = req.session?.user;
        
        if (user.role !== 'admin' && user.role !== 'superadmin') {
            console.warn(`Unauthorized admin access attempt by user: ${user.email} with role: ${user.role}`);
            if (res) {
                return res.status(403).json({ 
                    error: 'Admin privileges required',
                    code: 'FORBIDDEN',
                    timestamp: new Date().toISOString()
                });
            }
            return false;
        }
        
        // Log admin access for security monitoring
        console.log(`Admin access granted to: ${user.email} (${user.role})`);
        
        if (next) {
            return next();
        }
        
        return true;
    } catch (error) {
        console.error('Admin authorization error:', error);
        if (res) {
            return res.status(500).json({ 
                error: 'Authorization error',
                code: 'AUTHZ_ERROR',
                timestamp: new Date().toISOString()
            });
        }
        return false;
    }
}

/**
 * Enhanced function to get current user from session
 * @param {object} req - Request object with session
 * @returns {object|null} User object or null if not authenticated
 */
function getCurrentUser(req) {
    try {
        const user = req.session?.user;
        
        if (!user) {
            return null;
        }

        // Return sanitized user data (exclude sensitive information)
        return {
            email: user.email,
            role: user.role,
            name: user.name,
            loginTime: user.loginTime,
            // Don't return session tokens or other sensitive data
        };
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Enhanced login user function with security checks
 * @param {object} req - Request object with session
 * @param {object} userData - User data to store in session
 * @returns {Promise<void>}
 */
async function loginUser(req, userData) {
    try {
        // Validate user data before storing
        if (!userData.email || !userData.role) {
            throw new Error('Invalid user data: email and role are required');
        }

        // Validate role
        if (!SECURITY_CONFIG.ALLOWED_ROLES.includes(userData.role)) {
            throw new Error(`Invalid role: ${userData.role}`);
        }

        // Generate session data
        const sessionData = {
            email: userData.email.toLowerCase(), // Normalize email
            role: userData.role,
            name: userData.name || '',
            loginTime: new Date().toISOString(),
            // Add session fingerprint for additional security
            userAgent: req.headers['user-agent'] || '',
            ipAddress: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '',
        };

        req.session.user = sessionData;
        
        // Save session
        await req.session.save();
        
        console.log(`User logged in: ${userData.email} (${userData.role}) from ${sessionData.ipAddress}`);
    } catch (error) {
        console.error('Error logging in user:', error);
        throw new Error('Failed to create user session');
    }
}

/**
 * Enhanced logout function with cleanup
 * @param {object} req - Request object with session
 * @returns {Promise<void>}
 */
async function logoutUser(req) {
    try {
        const user = req.session?.user;
        
        if (user) {
            console.log(`User logged out: ${user.email} (${user.role})`);
        }
        
        // Destroy session
        req.session.destroy();
    } catch (error) {
        console.error('Error logging out user:', error);
        // Don't throw error on logout - best effort cleanup
    }
}

/**
 * Enhanced session configuration validation
 * @throws {Error} If session secret is missing or too short
 */
function validateSessionConfig() {
    const secret = process.env.SESSION_SECRET;
    
    if (!secret) {
        throw new Error('SESSION_SECRET environment variable is required');
    }
    
    if (secret.length < SECURITY_CONFIG.MIN_SECRET_LENGTH) {
        const error = `SESSION_SECRET should be at least ${SECURITY_CONFIG.MIN_SECRET_LENGTH} characters for security`;
        if (process.env.NODE_ENV === 'production') {
            throw new Error(error);
        } else {
            console.warn(`⚠️  ${error}`);
        }
    }
    
    // Check for default development values in production
    if (process.env.NODE_ENV === 'production' && secret.includes('dev-secret')) {
        throw new Error('Production SESSION_SECRET must not contain default development values');
    }

    // Validate environment-specific requirements
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.VERCEL_URL && !process.env.COOKIE_DOMAIN) {
            console.warn('⚠️  Consider setting COOKIE_DOMAIN for production deployment');
        }
    }

    console.log(`✅ Session configuration validated for ${process.env.NODE_ENV || 'development'} environment`);
}

/**
 * Session cleanup utility - remove expired sessions data
 * Note: This is a helper for potential future session store implementation
 */
function cleanupExpiredSessions() {
    // Currently using Iron Session's built-in cleanup
    // This function is a placeholder for custom session store implementation
    console.log('Session cleanup completed');
}

/**
 * Security middleware to check session fingerprint
 * @param {object} req - Request object
 * @returns {boolean} True if session is valid
 */
function validateSessionFingerprint(req) {
    try {
        const user = req.session?.user;
        
        if (!user) {
            return false;
        }

        // Check if user agent has changed (potential session hijacking)
        const currentUserAgent = req.headers['user-agent'] || '';
        if (user.userAgent && user.userAgent !== currentUserAgent) {
            console.warn(`Session fingerprint mismatch for user: ${user.email}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Session fingerprint validation error:', error);
        return false;
    }
}

// Validate configuration on module load
try {
    validateSessionConfig();
} catch (error) {
    console.error('❌ Session configuration error:', error.message);
    if (process.env.NODE_ENV === 'production') {
        throw error;
    }
}

// Optional: Set up periodic cleanup (if using custom session store)
if (process.env.NODE_ENV === 'production') {
    setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Run every hour
}

module.exports = {
    sessionOptions,
    withSessionRoute,
    requireAuth,
    requireAdmin,
    getCurrentUser,
    loginUser,
    logoutUser,
    validateSessionConfig,
    validateSessionFingerprint,
    cleanupExpiredSessions,
    SECURITY_CONFIG
};