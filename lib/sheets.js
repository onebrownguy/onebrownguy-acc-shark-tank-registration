/* ****************************************
 * Google Sheets API Client Configuration
 * Centralized authentication and client creation for Google Sheets access
 * 
 * @author ACC Development Team (Abel)
 * @version 1.0
 * @date July 2025
 * @note Requires GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables
 * @note Used by both submission and authentication endpoints
 ****************************************/

const { google } = require('googleapis');

/**
 * Create authenticated Google Sheets client
 * @returns {Promise<object>} Authenticated sheets client instance
 * @throws {Error} If environment variables are missing or authentication fails
 */
async function createSheetsClient() {
    try {
        // Validate required environment variables
        if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
            throw new Error('Missing required Google Sheets credentials in environment variables');
        }

        // Format private key (replace literal \n with actual newlines)
        const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

        // Create JWT auth client
        const auth = new google.auth.JWT(
            process.env.GOOGLE_CLIENT_EMAIL,
            null,
            privateKey,
            ['https://www.googleapis.com/auth/spreadsheets']
        );

        // Authorize the client
        await auth.authorize();

        // Create and return sheets client
        const sheets = google.sheets({ version: 'v4', auth });
        
        console.log('Google Sheets client authenticated successfully');
        return sheets;

    } catch (error) {
        console.error('Failed to create Google Sheets client:', error.message);
        throw new Error(`Google Sheets authentication failed: ${error.message}`);
    }
}

/**
 * Get values from a specific range in the spreadsheet
 * @param {object} sheets - Authenticated Google Sheets client
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - The range to read (e.g., 'Users!A2:G')
 * @returns {Promise<Array>} Array of row data
 */
async function getSheetValues(sheets, spreadsheetId, range) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        
        return response.data.values || [];
    } catch (error) {
        console.error(`Failed to get values from range ${range}:`, error.message);
        throw new Error(`Failed to read from sheet: ${error.message}`);
    }
}

/**
 * Append values to a specific range in the spreadsheet
 * @param {object} sheets - Authenticated Google Sheets client
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - The range to append to (e.g., 'Submissions!A:F')
 * @param {Array} values - Array of values to append
 * @returns {Promise<object>} Response from the append operation
 */
async function appendSheetValues(sheets, spreadsheetId, range, values) {
    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [values]
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`Failed to append values to range ${range}:`, error.message);
        throw new Error(`Failed to write to sheet: ${error.message}`);
    }
}

/**
 * Find user by email in Users sheet
 * @param {object} sheets - Authenticated Google Sheets client
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} email - Email to search for
 * @returns {Promise<object|null>} User object or null if not found
 */
async function findUserByEmail(sheets, spreadsheetId, email) {
    try {
        const users = await getSheetValues(sheets, spreadsheetId, 'Users!A2:G');
        
        // Find user row by email (assuming email is in column A)
        const userRow = users.find(row => row[0] && row[0].toLowerCase() === email.toLowerCase());
        
        if (!userRow) {
            return null;
        }

        // Return user object with structured data
        // Columns: Email, PasswordHash, Role, Status, InviteToken, CreatedAt, Name
        return {
            email: userRow[0],
            password: userRow[1], // Hashed password
            role: userRow[2] || 'user',
            status: userRow[3] || 'active',
            inviteToken: userRow[4] || '',
            created: userRow[5] || '',
            name: userRow[6] || ''
        };
    } catch (error) {
        console.error(`Failed to find user by email ${email}:`, error.message);
        throw new Error(`User lookup failed: ${error.message}`);
    }
}

/**
 * Update user's last login timestamp (optional - not in current sheet structure)
 * @param {object} sheets - Authenticated Google Sheets client
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} email - Email of user to update
 * @returns {Promise<void>}
 */
async function updateUserLastLogin(sheets, spreadsheetId, email) {
    try {
        // Since there's no lastLogin column in your current structure, 
        // we'll just log the login for now
        console.log(`Login recorded for user ${email} at ${new Date().toISOString()}`);
        
        // If you want to add a lastLogin column later, uncomment below:
        /*
        const users = await getSheetValues(sheets, spreadsheetId, 'Users!A2:H');
        const userRowIndex = users.findIndex(row => row[0] && row[0].toLowerCase() === email.toLowerCase());
        
        if (userRowIndex === -1) {
            console.warn(`User ${email} not found for last login update`);
            return;
        }

        // Update last login (column H, row index + 2 for header offset)
        const range = `Users!H${userRowIndex + 2}`;
        const timestamp = new Date().toISOString();
        
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[timestamp]]
            }
        });
        
        console.log(`Updated last login for user ${email}`);
        */
    } catch (error) {
        console.error(`Failed to update last login for ${email}:`, error.message);
        // Don't throw - this is non-critical
    }
}

module.exports = {
    createSheetsClient,
    getSheetValues,
    appendSheetValues,
    findUserByEmail,
    updateUserLastLogin
};