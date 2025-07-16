/* ****************************************
 * NEST FEST Multi-Role Participation API Handler
 * Handles participation interest form submissions with Google Sheets integration
 * 
 * @author NEST FEST Development Team
 * @version 1.1 - Enhanced for Multi-Role Support
 * @date July 2025
 * @note Uses CommonJS modules for consistency with codebase
 * @note Integrates with "Participants" tab in Google Sheets
 * @note Sends confirmation emails via SendGrid
 * @note Supports 6 different involvement types with specialized content
 ****************************************/

const { createSheetsClient, appendSheetValues } = require('../lib/sheets');
const sgMail = require('@sendgrid/mail');

/* ****************************************
 * Initialize SendGrid with API key from environment
 ****************************************/
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/* ****************************************
 * Main handler function for participation form submissions
 ****************************************/
async function participateHandler(req, res) {
    /* ****************************************
     * Process multi-role participation form submissions
     * @param req : request object with form data
     * @param res : response object for sending results
     * @return : JSON response with success/error status
     ****************************************/
    
    // CORS headers for frontend integration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED'
        });
    }

    try {
        const { fullName, email, involvementType, questions, additionalInfo } = req.body;

        // Validate required fields
        if (!fullName || !email || !involvementType) {
            return res.status(400).json({ 
                error: 'Full name, email, and involvement type are required',
                code: 'MISSING_REQUIRED_FIELDS'
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

        // Validate involvement type
        const validTypes = [
            'Student Entrepreneur',
            'Mentor',
            'Judge/Investor', 
            'Volunteer',
            'Audience Member',
            'General Interest'
        ];
        
        if (!validTypes.includes(involvementType)) {
            return res.status(400).json({ 
                error: 'Invalid involvement type',
                code: 'INVALID_INVOLVEMENT_TYPE',
                validTypes 
            });
        }

        console.log(`Participation request: ${involvementType} - ${fullName} (${email})`);

        /* ****************************************
         * Google Sheets Integration
         ****************************************/
        
        const sheets = await createSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // Timestamp in Central Time (Austin, TX)
        const timestamp = new Date().toLocaleString('en-US', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Prepare row values for Participants tab
        const participantData = [
            timestamp,
            fullName,
            email,
            involvementType,
            questions || '',
            additionalInfo || '',
            'Active' // Status field
        ];

        // Ensure Participants sheet exists with proper headers
        await ensureParticipantsSheet(sheets, spreadsheetId);

        // Append the new participation interest
        await appendSheetValues(sheets, spreadsheetId, 'Participants!A:G', participantData);

        /* ****************************************
         * Send Confirmation Email
         ****************************************/
        
        if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_SENDER_EMAIL) {
            try {
                const emailContent = generateEmailContent(fullName, involvementType);
                const confirmationEmail = {
                    to: email,
                    from: process.env.SENDGRID_SENDER_EMAIL,
                    subject: `NEST FEST ${involvementType} Interest Confirmed`,
                    html: emailContent
                };
                
                await sgMail.send(confirmationEmail);
                console.log(`Confirmation email sent to: ${email} (${involvementType})`);
            } catch (emailError) {
                console.error('Email failed:', emailError.message);
                // Don't fail the entire request if email fails
            }
        }

        console.log('Successfully recorded participation interest:', {
            fullName, email, involvementType, timestamp
        });

        return res.status(200).json({
            success: true,
            message: 'Participation interest submitted successfully!',
            data: {
                involvementType,
                timestamp,
                confirmationSent: !!process.env.SENDGRID_API_KEY
            }
        });

    } catch (error) {
        console.error('Participation submission error:', error.message);
        
        return res.status(500).json({
            error: 'Internal server error. Please try again.',
            code: 'INTERNAL_SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/* ****************************************
 * Ensure Participants sheet exists with proper headers
 ****************************************/
async function ensureParticipantsSheet(sheets, spreadsheetId) {
    /* ****************************************
     * Create or verify Participants sheet with proper column headers
     * @param sheets : Google Sheets client instance
     * @param spreadsheetId : Google Sheets spreadsheet ID
     * @return : void
     ****************************************/
    
    try {
        // Check if sheet exists and has data
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Participants!A1:G1000',
        });

        // If sheet is empty or doesn't exist, create headers
        if (!response.data.values || response.data.values.length === 0) {
            const headers = [
                'Timestamp',
                'Full Name', 
                'Email',
                'Involvement Type',
                'Questions/Notes',
                'Additional Info',
                'Status'
            ];

            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'Participants!A1:G1',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [headers]
                }
            });

            console.log('Participants sheet headers created');
        }
    } catch (error) {
        console.warn('Error ensuring Participants sheet:', error.message);
        // Continue anyway - the append operation will create the sheet if needed
    }
}

/* ****************************************
 * Generate personalized email content based on involvement type
 ****************************************/
function generateEmailContent(fullName, involvementType) {
    /* ****************************************
     * Create customized email content for different involvement types
     * @param fullName : participant's full name
     * @param involvementType : type of involvement selected
     * @return : HTML email content string
     ****************************************/
    
    const baseContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #2E1A47 0%, #3D2558 100%); color: white; padding: 40px 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 2rem;">NEST FEST</h1>
                <p style="margin: 10px 0 0 0; font-size: 1.1rem; opacity: 0.9;">Austin Community College</p>
                <p style="margin: 5px 0 0 0; font-size: 1rem; opacity: 0.8;">Thank you for your interest!</p>
            </div>
            <div style="padding: 40px 30px;">
                <h2 style="color: #2E1A47; margin-bottom: 20px;">Hello ${fullName}!</h2>
                <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
                    Thank you for expressing interest in participating in NEST FEST as a <strong>${involvementType}</strong>.
                </p>
    `;

    const typeSpecificContent = {
        'Student Entrepreneur': `
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
                We're excited about your entrepreneurial journey! As a student entrepreneur, you have the opportunity to 
                pitch your business idea and compete for prizes while gaining valuable experience.
            </p>
            <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #2E1A47; margin-bottom: 15px;">Next Steps for Student Entrepreneurs:</h3>
                <ul style="color: #555; line-height: 1.8;">
                    <li>Complete the full entrepreneur registration form</li>
                    <li>Use our AI-powered quick-builder tool for pitch assistance</li>
                    <li>Prepare your 5-minute business pitch presentation</li>
                    <li>Practice your presentation with timing</li>
                    <li>Gather supporting materials (business plan, prototypes, etc.)</li>
                </ul>
                <p style="color: #333; margin-top: 15px;">
                    <strong>Pro Tip:</strong> Visit our 
                    <a href="${process.env.VERCEL_URL || 'https://acc-shark-tank.vercel.app'}/quick-builder.html" 
                       style="color: #2E1A47; text-decoration: none; font-weight: bold;">
                        Quick Builder Tool
                    </a> 
                    for AI-powered help with your business description and pitch outline.
                </p>
            </div>
        `,
        'Mentor': `
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
                Your experience and guidance will be invaluable to aspiring student entrepreneurs. We'll match you with 
                students who can benefit most from your expertise and industry knowledge.
            </p>
            <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #2E1A47; margin-bottom: 15px;">What to Expect as a Mentor:</h3>
                <ul style="color: #555; line-height: 1.8;">
                    <li>One-on-one mentoring sessions with student entrepreneurs</li>
                    <li>Group workshops and panel discussions</li>
                    <li>Networking opportunities with other mentors and industry leaders</li>
                    <li>Recognition for your contribution to student entrepreneurship</li>
                    <li>Opportunity to identify and support promising student talent</li>
                </ul>
            </div>
        `,
        'Judge/Investor': `
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
                As a judge or investor, you'll play a crucial role in evaluating student business ideas and providing 
                valuable feedback that can shape their entrepreneurial journey.
            </p>
            <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #2E1A47; margin-bottom: 15px;">Judge/Investor Responsibilities:</h3>
                <ul style="color: #555; line-height: 1.8;">
                    <li>Evaluate student entrepreneur presentations</li>
                    <li>Provide constructive feedback and guidance</li>
                    <li>Participate in Q&A sessions with participants</li>
                    <li>Help select winners in various categories</li>
                    <li>Network with promising student entrepreneurs</li>
                    <li>Share industry insights and expertise</li>
                </ul>
            </div>
        `,
        'Volunteer': `
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
                Volunteers are essential to making NEST FEST a success! Your support helps create an amazing experience 
                for all participants and contributes to the growth of student entrepreneurship.
            </p>
            <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #2E1A47; margin-bottom: 15px;">Volunteer Opportunities:</h3>
                <ul style="color: #555; line-height: 1.8;">
                    <li>Event setup and breakdown</li>
                    <li>Registration and check-in assistance</li>
                    <li>Technical support during presentations</li>
                    <li>Networking facilitation between participants</li>
                    <li>General event support and coordination</li>
                    <li>Social media and documentation assistance</li>
                </ul>
            </div>
        `,
        'Audience Member': `
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
                Excellent choice! Attending NEST FEST as an audience member is a fantastic way to see innovation 
                in action and connect with the next generation of entrepreneurs.
            </p>
            <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #2E1A47; margin-bottom: 15px;">What You'll Experience:</h3>
                <ul style="color: #555; line-height: 1.8;">
                    <li>Exciting student entrepreneur pitch presentations</li>
                    <li>Networking opportunities with students and industry professionals</li>
                    <li>Learning from successful business leaders and mentors</li>
                    <li>Discovering innovative business ideas from students</li>
                    <li>Supporting local student entrepreneurship</li>
                    <li>Participating in workshops and panel discussions</li>
                </ul>
            </div>
        `,
        'General Interest': `
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
                Thank you for your interest in NEST FEST! We're excited to have you be part of our entrepreneurial 
                community. We'll keep you informed about opportunities to get involved.
            </p>
            <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="color: #2E1A47; margin-bottom: 15px;">Ways to Get Involved:</h3>
                <ul style="color: #555; line-height: 1.8;">
                    <li>Attend as an audience member</li>
                    <li>Volunteer during the event</li>
                    <li>Mentor student entrepreneurs</li>
                    <li>Join our networking events</li>
                    <li>Follow our social media for updates</li>
                    <li>Spread the word about NEST FEST</li>
                </ul>
            </div>
        `
    };

    const endContent = `
            <p style="color: #333; line-height: 1.6; margin-bottom: 30px;">
                We'll be in touch soon with more details about the event, including dates, location, and 
                specific next steps for your involvement. Keep an eye on your inbox for updates!
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.VERCEL_URL || 'https://acc-shark-tank.vercel.app'}" 
                   style="background: linear-gradient(135deg, #2E1A47 0%, #3D2558 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Visit NEST FEST Hub
                </a>
            </div>
            <p style="color: #666; font-size: 0.9rem; margin-top: 30px;">
                Questions? Reply to this email or contact us through our website.
            </p>
        </div>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 0.8rem;">
            <p style="margin: 0;">© 2025 NEST FEST - Austin Community College</p>
            <p style="margin: 5px 0 0 0;">Turning Student Ideas Into Reality</p>
        </div>
    </div>
    `;

    return baseContent + (typeSpecificContent[involvementType] || typeSpecificContent['General Interest']) + endContent;
}

module.exports = participateHandler;