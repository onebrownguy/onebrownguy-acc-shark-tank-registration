/* ****************************************
 * Submissions API Handler
 * Provides read access to ACC Shark Tank submissions for admin dashboard
 * 
 * @author ACC Development Team (Abel)
 * @version 1.0
 * @date July 2025
 * @note Requires admin authentication to access submission data
 * @note Integrates with Google Sheets for data retrieval
 ****************************************/

const { withSessionRoute, requireAdmin } = require('../lib/auth');
const { createSheetsClient, getSheetValues } = require('../lib/sheets');

/**
 * Submissions API handler for admin data access
 * @param {object} req - Request object with session
 * @param {object} res - Response object
 * @returns {Promise<void>} JSON response with submissions data
 */
async function submissionsHandler(req, res) {
    // Check authentication and admin privileges
    if (!requireAdmin(req, res)) {
        return; // Response already sent by requireAdmin
    }

    if (req.method === 'GET') {
        await handleGetSubmissions(req, res);
    } else {
        return res.status(405).json({ 
            error: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED' 
        });
    }
}

/**
 * Handle GET request for submissions data
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @returns {Promise<void>}
 */
async function handleGetSubmissions(req, res) {
    try {
        console.log(`Admin ${req.user.email} requested submissions data`);

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

        // Get submissions from Google Sheets
        // Assuming structure: Full Name, Email, Major, Business Name, Business Description, Timestamp
        const submissionsData = await getSheetValues(sheets, spreadsheetId, 'Submissions!A2:F');

        // Transform data for frontend consumption
        const submissions = submissionsData.map((row, index) => {
            // Handle missing data gracefully
            const [fullName = '', email = '', major = '', businessName = '', businessDescription = '', timestamp = ''] = row;
            
            return {
                id: index + 1, // Simple ID based on row position
                fullName: fullName.trim(),
                email: email.trim().toLowerCase(),
                major: major.trim(),
                businessName: businessName.trim(),
                businessDescription: businessDescription.trim(),
                timestamp: timestamp || new Date().toISOString(),
                status: determineSubmissionStatus(timestamp) // Auto-determine status based on age
            };
        });

        // Filter out empty rows
        const validSubmissions = submissions.filter(s => s.fullName && s.email);

        // Sort by timestamp (newest first)
        validSubmissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply pagination if requested
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedSubmissions = validSubmissions.slice(startIndex, endIndex);

        // Calculate statistics
        const stats = calculateSubmissionStats(validSubmissions);

        console.log(`Returning ${paginatedSubmissions.length} submissions (${validSubmissions.length} total) to admin ${req.user.email}`);

        return res.status(200).json({
            success: true,
            data: {
                submissions: paginatedSubmissions,
                pagination: {
                    page,
                    limit,
                    total: validSubmissions.length,
                    pages: Math.ceil(validSubmissions.length / limit)
                },
                stats
            }
        });

    } catch (error) {
        console.error('Failed to fetch submissions:', error.message);
        
        return res.status(500).json({ 
            error: 'Failed to fetch submissions data',
            code: 'FETCH_ERROR' 
        });
    }
}

/**
 * Determine submission status based on timestamp and other factors
 * @param {string} timestamp - Submission timestamp
 * @returns {string} Status ('new', 'reviewed', 'approved', 'rejected')
 */
function determineSubmissionStatus(timestamp) {
    if (!timestamp) return 'new';
    
    const submissionDate = new Date(timestamp);
    const now = new Date();
    const daysDiff = (now - submissionDate) / (1000 * 60 * 60 * 24);
    
    // Simple auto-status logic - in real app, this would be stored in sheets
    if (daysDiff < 1) {
        return 'new';
    } else if (daysDiff < 3) {
        return 'reviewed';
    } else {
        // For demo purposes, randomly assign approved/reviewed to older submissions
        return Math.random() > 0.3 ? 'approved' : 'reviewed';
    }
}

/**
 * Calculate submission statistics
 * @param {Array} submissions - Array of submission objects
 * @returns {object} Statistics object
 */
function calculateSubmissionStats(submissions) {
    const total = submissions.length;
    
    // Count by status
    const statusCounts = submissions.reduce((acc, submission) => {
        acc[submission.status] = (acc[submission.status] || 0) + 1;
        return acc;
    }, {});

    // Count submissions by time periods
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayCount = submissions.filter(s => new Date(s.timestamp) >= today).length;
    const weekCount = submissions.filter(s => new Date(s.timestamp) >= thisWeek).length;
    const monthCount = submissions.filter(s => new Date(s.timestamp) >= thisMonth).length;

    // Count by major
    const majorCounts = submissions.reduce((acc, submission) => {
        const major = submission.major || 'Unknown';
        acc[major] = (acc[major] || 0) + 1;
        return acc;
    }, {});

    return {
        total,
        statusCounts: {
            new: statusCounts.new || 0,
            reviewed: statusCounts.reviewed || 0,
            approved: statusCounts.approved || 0,
            rejected: statusCounts.rejected || 0
        },
        timePeriods: {
            today: todayCount,
            thisWeek: weekCount,
            thisMonth: monthCount
        },
        majorDistribution: majorCounts,
        lastUpdated: new Date().toISOString()
    };
}

// Export the handler wrapped with Iron Session
module.exports = withSessionRoute(submissionsHandler);