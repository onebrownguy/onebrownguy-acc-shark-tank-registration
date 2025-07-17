/* *******************************
 * Session Lookup API Handler
 * Provides admin access to search and retrieve AI coaching sessions
 * 
 * @author NEST FEST Development Team
 * @version 1.0
 * @date July 2025
 * @note Requires admin authentication to access session data
 * @note Integrates with Google Sheets for session retrieval
 *******************************/

const { withSessionRoute, requireAdmin } = require('../lib/auth');
const { createSheetsClient, getSheetValues } = require('../lib/sheets');

/**
 * Session lookup API handler for admin access
 */
async function sessionLookupHandler(req, res) {
    // Check authentication and admin privileges
    if (!requireAdmin(req, res)) {
        return; // Response already sent by requireAdmin
    }

    if (req.method === 'GET') {
        await handleSessionLookup(req, res);
    } else {
        return res.status(405).json({ 
            error: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED' 
        });
    }
}

/**
 * Handle session lookup request
 */
async function handleSessionLookup(req, res) {
    try {
        const { sessionId, email, name } = req.query;
        
        console.log(`Admin ${req.user.email} requested session lookup:`, { sessionId, email, name });

        // Create Google Sheets client
        const sheets = await createSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        if (!spreadsheetId) {
            return res.status(500).json({ 
                error: 'Google Sheets not configured',
                code: 'SHEETS_NOT_CONFIGURED' 
            });
        }

        // Get AI coaching sessions from Google Sheets
        const range = 'AI_Coaching!A:L';  // Updated range to include session ID
        const values = await getSheetValues(sheets, spreadsheetId, range);
        
        if (!values || values.length === 0) {
            return res.status(200).json({ 
                sessions: [],
                total: 0,
                message: 'No AI coaching sessions found'
            });
        }

        // Parse sessions data
        const sessions = values.slice(1).map(row => ({
            timestamp: row[0] || '',
            studentName: row[1] || '',
            studentEmail: row[2] || '',
            studentMajor: row[3] || '',
            businessIdea: row[4] || '',
            problemDescription: row[5] || '',
            solutionDescription: row[6] || '',
            fundingNeeds: row[7] || '',
            aiGenerated: row[8] || '',
            generatedContent: row[9] || '',
            sessionType: row[10] || '',
            sessionId: row[11] || ''
        }));

        // Filter sessions based on search criteria
        let filteredSessions = sessions;

        if (sessionId) {
            filteredSessions = filteredSessions.filter(session => 
                session.sessionId.toLowerCase().includes(sessionId.toLowerCase())
            );
        }

        if (email) {
            filteredSessions = filteredSessions.filter(session => 
                session.studentEmail.toLowerCase().includes(email.toLowerCase())
            );
        }

        if (name) {
            filteredSessions = filteredSessions.filter(session => 
                session.studentName.toLowerCase().includes(name.toLowerCase())
            );
        }

        // Sort by timestamp (most recent first)
        filteredSessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Parse generated content for display
        const processedSessions = filteredSessions.map(session => {
            let parsedContent = {};
            if (session.generatedContent) {
                try {
                    parsedContent = JSON.parse(session.generatedContent);
                } catch (e) {
                    parsedContent = { raw: session.generatedContent };
                }
            }

            return {
                ...session,
                generatedContent: parsedContent,
                formattedTimestamp: new Date(session.timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                })
            };
        });

        return res.status(200).json({
            sessions: processedSessions,
            total: processedSessions.length,
            searchCriteria: { sessionId, email, name }
        });

    } catch (error) {
        console.error('Session lookup error:', error);
        return res.status(500).json({ 
            error: 'Failed to retrieve session data',
            code: 'SESSION_LOOKUP_ERROR' 
        });
    }
}

module.exports = withSessionRoute(sessionLookupHandler);