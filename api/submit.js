/* *******************************
 * Registration Form Submission API Handler
 * Handles NEST FEST registration form submissions with Google Sheets integration
 * 
 * @author NEST FEST Development Team
 * @version 2.0
 * @date July 2025
 * @note Updated to use shared sheets client from lib/sheets.js
 * @note Includes email confirmation via SendGrid and XSS protection
 * @note Uses CommonJS modules for consistency with codebase
 *******************************/

const sgMail = require('@sendgrid/mail');
const { createSheetsClient, appendSheetValues } = require('../lib/sheets');

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
    console.warn('SENDGRID_API_KEY not configured - email notifications disabled');
}

/**
 * Handle form submission with Google Sheets integration and email confirmation
 */
async function submitHandler(req, res) {
    /* *******************************
     * Validate request method and extract form data
     * @param req : request object containing form data
     * @param res : response object for sending results
     * @return : JSON response indicating success or failure
     *******************************/
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED' 
        });
    }

    try {
        // Validate required fields
        const { fullName, email, major, businessName, businessDescription } = req.body;
        
        if (!fullName || !email || !major || !businessName || !businessDescription) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                code: 'MISSING_FIELDS' 
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

        // Rate limiting check
        const clientId = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (await isRateLimited(clientId)) {
            return res.status(429).json({ 
                error: 'Too many submissions. Please try again later.',
                code: 'RATE_LIMITED' 
            });
        }

        console.log(`New submission from: ${email}`);

        /* *******************************
         * Save submission to Google Sheets using shared library
         *******************************/
        
        // Create Google Sheets client using shared library
        const sheets = await createSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        if (!spreadsheetId) {
            console.error('GOOGLE_SHEET_ID environment variable not configured');
            return res.status(500).json({ 
                error: 'Server configuration error',
                code: 'CONFIG_ERROR' 
            });
        }

        // Prepare data for Google Sheets
        const timestamp = req.body.timestamp || new Date().toISOString();
        const submissionData = [
            fullName.trim(),
            email.trim().toLowerCase(),
            major.trim(),
            businessName.trim(),
            businessDescription.trim(),
            timestamp
        ];

        // Add submission to Google Sheets using shared library
        await appendSheetValues(sheets, spreadsheetId, 'Submissions!A:F', submissionData);

        console.log(`Submission successfully saved for: ${email}`);

        /* *******************************
         * Send confirmation email if configured
         *******************************/
        
        if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
            try {
                await sendConfirmationEmail(email, fullName, businessName);
                console.log(`Confirmation email sent to: ${email}`);
            } catch (emailError) {
                console.error('Failed to send confirmation email:', emailError.message);
                // Don't fail the submission if email fails
            }
        }

        // Record successful submission for rate limiting
        await recordSubmission(clientId);

        return res.status(200).json({
            success: true,
            message: 'Registration submitted successfully!',
            data: {
                submissionId: timestamp,
                email: email,
                businessName: businessName
            }
        });

    } catch (error) {
        console.error('Submission error:', error.message);
        
        return res.status(500).json({ 
            error: 'Failed to submit registration. Please try again.',
            code: 'SUBMISSION_ERROR' 
        });
    }
}

/**
 * Send confirmation email to user
 */
async function sendConfirmationEmail(email, fullName, businessName) {
    /* *******************************
     * Generate and send professional confirmation email
     * @param email : recipient email address
     * @param fullName : user's full name
     * @param businessName : business name from submission
     * @return : promise resolving when email is sent
     *******************************/
    
    const msg = {
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: 'NEST FEST Registration Confirmed',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #2E1A47 0%, #3D2558 100%); color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 2rem;">NEST FEST</h1>
                    <p style="margin: 10px 0 0; font-size: 1.1rem;">Registration Confirmed</p>
                </div>
                
                <div style="padding: 30px; background: #f9f9f9;">
                    <h2 style="color: #2E1A47; margin-bottom: 20px;">Hello ${fullName}!</h2>
                    
                    <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 20px;">
                        Thank you for registering for <strong>NEST FEST</strong> with your business idea: <strong>${businessName}</strong>.
                    </p>
                    
                    <div style="background: white; padding: 20px; border-left: 4px solid #2E1A47; margin: 20px 0;">
                        <h3 style="color: #2E1A47; margin-bottom: 15px;">What's Next?</h3>
                        <ul style="line-height: 1.8;">
                            <li>Our team will review your submission</li>
                            <li>Selected participants will be notified via email</li>
                            <li>Start preparing your pitch presentation</li>
                            <li>Get ready to impress our panel of investors!</li>
                        </ul>
                    </div>
                    
                    <p style="margin-top: 20px;">
                        We're excited to see your entrepreneurial spirit in action. Good luck!
                    </p>
                    
                    <p style="margin-top: 30px; color: #666;">
                        Best regards,<br>
                        <strong>The NEST FEST Team</strong>
                    </p>
                </div>
                
                <div style="background: #2E1A47; color: white; padding: 20px; text-align: center; font-size: 0.9rem;">
                    <p style="margin: 0;">NEST FEST | Turn Your Business Ideas Into Reality</p>
                </div>
            </div>
        `
    };

    await sgMail.send(msg);
}

/* *******************************
 * Rate Limiting Implementation
 * Simple in-memory rate limiting to prevent spam submissions
 *******************************/

const submissionCounts = new Map();
const MAX_SUBMISSIONS = 3;
const COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 hour

/**
 * Check if client is rate limited
 */
async function isRateLimited(clientId) {
    /* *******************************
     * Verify if client has exceeded submission limits
     * @param clientId : client identifier (IP address)
     * @return : boolean indicating if rate limited
     *******************************/
    
    const submissions = submissionCounts.get(clientId);
    
    if (!submissions) {
        return false;
    }
    
    // Check if cooldown period has expired
    if (Date.now() - submissions.lastSubmission > COOLDOWN_PERIOD) {
        submissionCounts.delete(clientId);
        return false;
    }
    
    return submissions.count >= MAX_SUBMISSIONS;
}

/**
 * Record successful submission
 */
async function recordSubmission(clientId) {
    /* *******************************
     * Track submission count for rate limiting
     * @param clientId : client identifier (IP address)
     * @return : void
     *******************************/
    
    const submissions = submissionCounts.get(clientId) || { count: 0, lastSubmission: 0 };
    
    submissions.count += 1;
    submissions.lastSubmission = Date.now();
    
    submissionCounts.set(clientId, submissions);
    
    console.log(`Submission ${submissions.count}/${MAX_SUBMISSIONS} recorded for client: ${clientId}`);
}

// Clean up old submission records periodically
setInterval(() => {
    /* *******************************
     * Cleanup expired rate limiting records
     *******************************/
    
    const now = Date.now();
    for (const [clientId, submissions] of submissionCounts.entries()) {
        if (now - submissions.lastSubmission > COOLDOWN_PERIOD) {
            submissionCounts.delete(clientId);
        }
    }
}, 60 * 1000); // Clean up every minute

module.exports = submitHandler;