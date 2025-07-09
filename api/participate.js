/* ****************************************
 * Nest Fest Participate API Handler
 * Handles participation interest form submissions with Google Sheets integration
 * 
 * @author Nest Fest Development Team
 * @version 1.0
 * @date July 2025
 * @note Integrates with "Participants" tab in Google Sheets
 * @note Sends confirmation emails via SendGrid
 ****************************************/

import { google } from 'googleapis';
import sgMail from '@sendgrid/mail';

/* ****************************************
 * Initialize SendGrid with API key from environment
 ****************************************/
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/* ****************************************
 * Main handler function for participation form submissions
 ****************************************/
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fullName, email, involvementType, questions } = req.body;

    // Validate required fields
    if (!fullName || !email || !involvementType) {
      return res.status(400).json({ error: 'Full name, email, and involvement type are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate involvement type
    const validTypes = ['Entrepreneur', 'Mentor', 'Volunteer', 'Judge/Investor', 'Sponsor', 'Audience'];
    if (!validTypes.includes(involvementType)) {
      return res.status(400).json({ error: 'Invalid involvement type' });
    }

    // Google Sheets auth
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Timestamp in Central Time
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
    const values = [[
      timestamp,
      fullName,
      email,
      involvementType,
      questions || ''
    ]];

    // Check & write header row if Participants sheet is empty
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Participants!A1:E1000',
    });
    if (!response.data.values || response.data.values.length === 0) {
      // If empty, write header row to the Participants sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Participants!A1:E1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['Timestamp', 'Full Name', 'Email', 'Involvement Type', 'Question/Notes']
          ]
        }
      });
    }

    // Append the new participation interest
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Participants!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    // Send confirmation email based on involvement type
    try {
      const emailContent = generateEmailContent(fullName, involvementType);
      const confirmationEmail = {
        to: email,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: `Nest Fest ${involvementType} Interest Confirmed`,
        html: emailContent
      };
      await sgMail.send(confirmationEmail);
      console.log('Confirmation email sent to:', email);
    } catch (emailError) {
      console.error('Email failed:', emailError);
      // Don't fail the entire request if email fails
    }

    console.log('Successfully recorded participation interest:', {
      fullName, email, involvementType, timestamp
    });

    return res.status(200).json({
      success: true,
      message: 'Participation interest submitted successfully!'
    });

  } catch (error) {
    console.error('Participation submission error:', error);
    return res.status(500).json({
      error: 'Internal server error. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/* ****************************************
 * Generate personalized email content based on involvement type
 * @param {string} fullName - Participant's full name
 * @param {string} involvementType - Type of involvement selected
 * @returns {string} - HTML email content
 ****************************************/
function generateEmailContent(fullName, involvementType) {
  const baseContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #2E1A47 0%, #3D2558 100%); color: white; padding: 40px 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 2rem;">Nest Fest</h1>
        <p style="margin: 10px 0 0 0; font-size: 1.1rem; opacity: 0.9;">Thank you for your interest!</p>
      </div>
      <div style="padding: 40px 30px;">
        <h2 style="color: #2E1A47; margin-bottom: 20px;">Hello ${fullName}!</h2>
        <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
          Thank you for expressing interest in participating in Nest Fest as a <strong>${involvementType}</strong>.
        </p>
  `;

  const typeSpecificContent = {
    'Entrepreneur': `
      <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
        We're excited about your entrepreneurial journey! For entrepreneurs, we recommend using our 
        <a href="${process.env.VERCEL_URL || 'https://acc-shark-tank.vercel.app'}/index.html" style="color: #2E1A47; text-decoration: none; font-weight: bold;">dedicated registration form</a> 
        which includes AI-powered submission guidance to help you craft the perfect business pitch.
      </p>
      <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3 style="color: #2E1A47; margin-bottom: 15px;">Next Steps for Entrepreneurs:</h3>
        <ul style="color: #555; line-height: 1.8;">
          <li>Complete the full entrepreneur registration form</li>
          <li>Prepare your business pitch presentation</li>
          <li>Practice your 5-minute pitch</li>
          <li>Gather any supporting materials (business plan, prototypes, etc.)</li>
        </ul>
      </div>
    `,
    'Mentor': `
      <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
        Your experience and guidance will be invaluable to aspiring entrepreneurs. We'll match you with 
        entrepreneurs who can benefit most from your expertise.
      </p>
      <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3 style="color: #2E1A47; margin-bottom: 15px;">What to Expect as a Mentor:</h3>
        <ul style="color: #555; line-height: 1.8;">
          <li>One-on-one mentoring sessions with entrepreneurs</li>
          <li>Group workshops and panels</li>
          <li>Networking opportunities with other mentors</li>
          <li>Recognition for your contribution to the entrepreneurial community</li>
        </ul>
      </div>
    `,
    'Volunteer': `
      <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
        Volunteers are the backbone of Nest Fest! Your support helps create an amazing experience for 
        all participants.
      </p>
      <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3 style="color: #2E1A47; margin-bottom: 15px;">Volunteer Opportunities:</h3>
        <ul style="color: #555; line-height: 1.8;">
          <li>Event setup and breakdown</li>
          <li>Registration and check-in assistance</li>
          <li>Technical support during presentations</li>
          <li>Networking facilitation</li>
          <li>General event support</li>
        </ul>
      </div>
    `,
    'Judge/Investor': `
      <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
        As a judge or investor, you'll play a crucial role in evaluating business ideas and providing 
        valuable feedback to entrepreneurs.
      </p>
      <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3 style="color: #2E1A47; margin-bottom: 15px;">Judge/Investor Responsibilities:</h3>
        <ul style="color: #555; line-height: 1.8;">
          <li>Evaluate entrepreneur presentations</li>
          <li>Provide constructive feedback</li>
          <li>Participate in Q&A sessions</li>
          <li>Help select winners in various categories</li>
          <li>Network with promising entrepreneurs</li>
        </ul>
      </div>
    `,
    'Sponsor': `
      <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
        Thank you for considering sponsoring Nest Fest! Your support helps make this event possible 
        and supports the next generation of entrepreneurs.
      </p>
      <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3 style="color: #2E1A47; margin-bottom: 15px;">Sponsorship Benefits:</h3>
        <ul style="color: #555; line-height: 1.8;">
          <li>Brand visibility and recognition</li>
          <li>Access to emerging talent and startups</li>
          <li>Networking with entrepreneurs and investors</li>
          <li>Corporate social responsibility impact</li>
          <li>Custom sponsorship packages available</li>
        </ul>
      </div>
    `,
    'Audience': `
      <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
        Great choice! Attending Nest Fest as an audience member is a fantastic way to see innovation 
        in action and connect with the entrepreneurial community.
      </p>
      <div style="background: #f8f6fc; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h3 style="color: #2E1A47; margin-bottom: 15px;">What You'll Experience:</h3>
        <ul style="color: #555; line-height: 1.8;">
          <li>Exciting entrepreneur pitch presentations</li>
          <li>Networking opportunities</li>
          <li>Learning from successful business leaders</li>
          <li>Discovering innovative business ideas</li>
          <li>Supporting local entrepreneurship</li>
        </ul>
      </div>
    `
  };

  const endContent = `
        <p style="color: #333; line-height: 1.6; margin-bottom: 30px;">
          We'll be in touch soon with more details about the event, including dates, location, and 
          specific next steps for your role.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://nest-fest.org/" style="background: linear-gradient(135deg, #2E1A47 0%, #3D2558 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Visit Nest Fest Website</a>
        </div>
        <p style="color: #666; font-size: 0.9rem; margin-top: 30px;">
          Questions? Reply to this email or contact us through our website.
        </p>
      </div>
      <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 0.8rem;">
        <p style="margin: 0;">© 2025 Nest Fest. Turning Ideas Into Reality.</p>
      </div>
    </div>
  `;

  return baseContent + (typeSpecificContent[involvementType] || '') + endContent;
}