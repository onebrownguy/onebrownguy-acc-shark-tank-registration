/* ****************************************
 * Session Validation API Handler
 * Provides session status and user information for client-side authentication checks
 * 
 * @author ACC Development Team (Abel)
 * @version 1.0
 * @date July 2025
 * @note Used by admin dashboard to verify authentication status
 * @note Also provides logout functionality
 ****************************************/

const { withSessionRoute, getCurrentUser, logoutUser } = require('../lib/auth');

/**
 * Session API handler for authentication checks and logout
 * @param {object} req - Request object with session
 * @param {object} res - Response object
 * @returns {Promise<void>} JSON response with session status
 */
async function sessionHandler(req, res) {
    try {
        if (req.method === 'GET') {
            // Check session status
            const user = getCurrentUser(req);
            
            if (!user) {
                return res.status(401).json({
                    authenticated: false,
                    message: 'No active session'
                });
            }
            
            // Return user info (without sensitive data)
            return res.status(200).json({
                authenticated: true,
                user: {
                    email: user.email,
                    role: user.role,
                    name: user.name,
                    loginTime: user.loginTime
                }
            });
            
        } else if (req.method === 'DELETE') {
            // Logout - destroy session
            await logoutUser(req);
            
            return res.status(200).json({
                success: true,
                message: 'Logged out successfully'
            });
            
        } else {
            return res.status(405).json({ 
                error: 'Method not allowed',
                code: 'METHOD_NOT_ALLOWED' 
            });
        }
        
    } catch (error) {
        console.error('Session API error:', error.message);
        
        return res.status(500).json({ 
            error: 'Internal server error',
            code: 'SERVER_ERROR' 
        });
    }
}

// Export the handler wrapped with Iron Session
module.exports = withSessionRoute(sessionHandler);