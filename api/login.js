/* ****************************************
 * Login API Handler
 * Handles user authentication for ACC Shark Tank admin system
 * 
 * @author ACC Development Team (Abel)
 * @version 1.0
 * @date July 2025
 * @note Integrates with Google Sheets for user storage and bcrypt for password verification
 * @note Uses Iron Session for secure session management
 ****************************************/

const bcrypt = require('bcrypt');
const { withSessionRoute, loginUser } = require('../lib/auth');
const { createSheetsClient, findUserByEmail, updateUserLastLogin } = require('../lib/sheets');

/**
 * Login API handler with session management
 * @param {object} req - Request object with body containing email and password
 * @param {object} res - Response object
 * @returns {Promise<void>} JSON response with success/error status
 */
async function loginHandler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED' 
        });
    }

    try {
        // Validate request body
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password are required',
                code: 'MISSING_CREDENTIALS' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Invalid email format',
                code: 'INVALID_EMAIL' 
            });
        }

        // Rate limiting check (simple in-memory approach)
        const clientId = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (await isRateLimited(clientId)) {
            return res.status(429).json({ 
                error: 'Too many login attempts. Please try again later.',
                code: 'RATE_LIMITED' 
            });
        }

        console.log(`Login attempt for email: ${email}`);

        // Create Google Sheets client
        const sheets = await createSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        if (!spreadsheetId) {
            console.error('GOOGLE_SHEET_ID environment variable not configured');
            return res.status(500).json({ 
                error: 'Server configuration error',
                code: 'CONFIG_ERROR' 
            });
        }

        // Find user in Google Sheets
        const user = await findUserByEmail(sheets, spreadsheetId, email);
        
        if (!user) {
            console.log(`User not found: ${email}`);
            await recordFailedAttempt(clientId);
            return res.status(401).json({ 
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS' 
            });
        }

        // Check if user account is active
        if (user.status && user.status.toLowerCase() !== 'active') {
            console.log(`Inactive account login attempt: ${email}`);
            return res.status(401).json({ 
                error: 'Account is not active',
                code: 'ACCOUNT_INACTIVE' 
            });
        }

        // Verify password using bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            console.log(`Invalid password for user: ${email}`);
            await recordFailedAttempt(clientId);
            return res.status(401).json({ 
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS' 
            });
        }

        // Successful authentication
        console.log(`Successful login for user: ${email} with role: ${user.role}`);

        // Create user session
        await loginUser(req, {
            email: user.email,
            role: user.role,
            name: user.name
        });

        // Update last login timestamp (non-blocking)
        updateUserLastLogin(sheets, spreadsheetId, email).catch(error => {
            console.warn('Failed to update last login:', error.message);
        });

        // Clear any rate limiting for successful login
        await clearRateLimit(clientId);

        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                email: user.email,
                role: user.role,
                name: user.name
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);
        
        // Don't expose internal errors to client
        return res.status(500).json({ 
            error: 'Internal server error',
            code: 'SERVER_ERROR' 
        });
    }
}

/* ****************************************
 * Rate Limiting Implementation
 * Simple in-memory rate limiting to prevent brute force attacks
 ****************************************/

const attemptCounts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Check if client is rate limited
 * @param {string} clientId - Client identifier (IP address)
 * @returns {Promise<boolean>} True if rate limited
 */
async function isRateLimited(clientId) {
    const attempts = attemptCounts.get(clientId);
    
    if (!attempts) {
        return false;
    }
    
    // Check if lockout period has expired
    if (Date.now() - attempts.lastAttempt > LOCKOUT_DURATION) {
        attemptCounts.delete(clientId);
        return false;
    }
    
    return attempts.count >= MAX_ATTEMPTS;
}

/**
 * Record failed login attempt
 * @param {string} clientId - Client identifier (IP address)
 * @returns {Promise<void>}
 */
async function recordFailedAttempt(clientId) {
    const attempts = attemptCounts.get(clientId) || { count: 0, lastAttempt: 0 };
    
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    
    attemptCounts.set(clientId, attempts);
    
    console.log(`Failed login attempt ${attempts.count}/${MAX_ATTEMPTS} for client: ${clientId}`);
}

/**
 * Clear rate limiting for client
 * @param {string} clientId - Client identifier (IP address)
 * @returns {Promise<void>}
 */
async function clearRateLimit(clientId) {
    attemptCounts.delete(clientId);
}

// Clean up old rate limit entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [clientId, attempts] of attemptCounts.entries()) {
        if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
            attemptCounts.delete(clientId);
        }
    }
}, 60 * 1000); // Clean up every minute

// Export the handler wrapped with Iron Session
module.exports = withSessionRoute(loginHandler);