/* *******************************
 * AI Coaching Session Handler
 * Manages student coaching sessions and generated content
 * 
 * @author NEST FEST Development Team
 * @version 2.0
 * @date July 2025
 * @note Handles AI coaching data and session tracking with email confirmation
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
 * Handle AI coaching session requests
 */
async function aiCoachingHandler(req, res) {
    // CORS headers
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
        const sessionData = req.body;

        // Validate required fields
        const requiredFields = ['studentName', 'studentEmail', 'businessIdea'];
        for (const field of requiredFields) {
            if (!sessionData[field]) {
                return res.status(400).json({ 
                    error: `Missing required field: ${field}`,
                    code: 'MISSING_FIELD' 
                });
            }
        }

        const sessionId = generateSessionId();
        
        // Save to Google Sheets if configured
        if (process.env.GOOGLE_SHEET_ID) {
            try {
                await saveCoachingSession(sessionData, sessionId);
            } catch (saveError) {
                console.warn('Failed to save to sheets:', saveError.message);
                // Don't fail the request if saving fails
            }
        }

        // Send confirmation email
        try {
            await sendConfirmationEmail(sessionData, sessionId);
        } catch (emailError) {
            console.warn('Failed to send confirmation email:', emailError.message);
            // Don't fail the request if email fails
        }

        return res.status(200).json({
            success: true,
            message: 'Coaching session saved successfully',
            sessionId: sessionId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('AI Coaching error:', error.message);
        
        return res.status(500).json({ 
            error: 'Failed to save coaching session',
            code: 'SESSION_SAVE_ERROR' 
        });
    }
}

/**
 * Save coaching session to Google Sheets
 */
async function saveCoachingSession(sessionData, sessionId) {
    const sheets = await createSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    const rowData = [
        new Date().toISOString(),
        sessionData.studentName || '',
        sessionData.studentEmail || '',
        sessionData.studentMajor || '',
        sessionData.businessIdea || '',
        sessionData.problemDescription || '',
        sessionData.solutionDescription || '',
        sessionData.fundingNeeds || '',
        sessionData.aiGenerated ? 'Yes' : 'No',
        JSON.stringify(sessionData.generatedContent || {}),
        'AI Coaching Session',
        sessionId
    ];

    await appendSheetValues(sheets, spreadsheetId, 'AI_Coaching!A:L', rowData);
}

/**
 * Send confirmation email to student
 */
async function sendConfirmationEmail(sessionData, sessionId) {
    if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_SENDER_EMAIL) {
        console.warn('SendGrid not configured - skipping email');
        return;
    }

    const emailContent = generateEmailContent(sessionData, sessionId);
    
    const msg = {
        to: sessionData.studentEmail,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: 'Your AI Presentation Coaching Session - NEST FEST',
        html: emailContent
    };

    await sgMail.send(msg);
    console.log('Confirmation email sent to:', sessionData.studentEmail);
}

/**
 * Generate email content for coaching session confirmation
 */
function generateEmailContent(sessionData, sessionId) {
    const studentName = sessionData.studentName || 'Student';
    const businessIdea = sessionData.businessIdea || 'your business idea';
    const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Presentation Coaching - NEST FEST</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2E1A47 0%, #3D2558 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: white; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 10px 10px; }
        .section { margin-bottom: 25px; }
        .section h2 { color: #2E1A47; margin-bottom: 15px; }
        .highlight { background: #f8f6fc; padding: 15px; border-left: 4px solid #2E1A47; margin: 15px 0; }
        .session-info { background: #e8f4f8; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .btn { display: inline-block; background: #2E1A47; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .tips { background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AI Presentation Coaching</h1>
            <p>Your personalized coaching materials are ready!</p>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>Hello ${studentName}!</h2>
                <p>Congratulations on completing your AI presentation coaching session! We've generated personalized materials to help you prepare for your NEST FEST presentation.</p>
            </div>
            
            <div class="session-info">
                <h3>Session Details</h3>
                <p><strong>Date:</strong> ${currentDate}</p>
                <p><strong>Session ID:</strong> ${sessionId}</p>
                <p><strong>Business Idea:</strong> ${businessIdea}</p>
            </div>
            
            <div class="section">
                <h2>Your AI-Generated Coaching Materials</h2>
                <p>We've created four essential coaching materials specifically for your presentation:</p>
                
                <div class="highlight">
                    <h3>1. Elevator Pitch</h3>
                    <p>A polished 30-second version of your business idea that captures attention and clearly communicates your value proposition.</p>
                </div>
                
                <div class="highlight">
                    <h3>2. Presentation Outline</h3>
                    <p>A structured 5-minute presentation with timing, key points, and delivery guidance specifically tailored to your business concept.</p>
                </div>
                
                <div class="highlight">
                    <h3>3. Speaker Notes</h3>
                    <p>Confidence-building tips, talking points, and strategies to help you deliver your presentation with impact.</p>
                </div>
                
                <div class="highlight">
                    <h3>4. Q&A Preparation</h3>
                    <p>Anticipated questions and strong answers to help you handle the Q&A session like a professional.</p>
                </div>
            </div>
            
            <div class="tips">
                <h3>Next Steps</h3>
                <ul>
                    <li>Review all four coaching materials thoroughly</li>
                    <li>Practice your elevator pitch until it feels natural</li>
                    <li>Rehearse your presentation multiple times</li>
                    <li>Prepare for Q&A using the provided guidance</li>
                    <li>Consider recording yourself to improve delivery</li>
                </ul>
            </div>
            
            <div class="section">
                <h2>Access Your Materials</h2>
                <p>Your coaching materials are available in your session. If you need to access them again, please contact our support team with your session ID: <strong>${sessionId}</strong></p>
                
                <a href="https://acc-shark-tank.vercel.app/quick-builder.html" class="btn">Return to AI Coach</a>
            </div>
            
            <div class="section">
                <h2>NEST FEST Resources</h2>
                <p>For additional support and resources:</p>
                <ul>
                    <li><a href="https://acc-shark-tank.vercel.app/">NEST FEST Main Site</a></li>
                    <li><a href="https://acc-shark-tank.vercel.app/participate.html">Other Ways to Participate</a></li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p><strong>NEST FEST</strong> - Austin Community College</p>
            <p>Empowering Student Entrepreneurs</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * Generate unique session ID
 */
function generateSessionId() {
    return 'coach_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

module.exports = aiCoachingHandler;