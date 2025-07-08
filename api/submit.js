/* ****************************************
 * Vercel serverless function for ACC Shark Tank registration form submission
 * Handles form validation, sanitization, and Google Sheets integration
 * @author ACC Development Team
 * @version 1.0
 ****************************************/

import { google } from 'googleapis';
import sgMail from '@sendgrid/mail';

/* ****************************************
 * Initialize SendGrid with API key from environment
 ****************************************/
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/* ****************************************
 * Main handler function for form submissions
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
    const { fullName, email, major, businessName, businessDescription } = req.body;

    // Validate required fields
    if (!fullName || !email || !major || !businessName || !businessDescription) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
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

    // Prepare row values
    const values = [[
      timestamp,
      fullName,
      email,
      major,
      businessName,
      businessDescription
    ]];

    // Check & write header row if sheet is empty
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Submissions!A1:K1000',
    });
    if (!response.data.values || response.data.values.length === 0) {
      // If empty, write header row to the Submissions sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Submissions!A1:F1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['Timestamp','Full Name','Email','Major','Business Name','Business Description']
          ]
        }
      });
    }

    // Append the new submission
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Submissions!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    // Send confirmation email
    try {
      const confirmationEmail = {
        to: email,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: 'ACC Shark Tank Registration Confirmation',
        html: `<h2>Registration Confirmed!</h2>
               <p>Dear ${fullName}, thank you for registering for ACC Shark Tank with ${businessName}.</p>`
      };
      await sgMail.send(confirmationEmail);
      console.log('Email sent to:', email);
    } catch (emailError) {
      console.error('Email failed:', emailError);
    }

    console.log('Successfully added registration to Google Sheets:', {
      fullName, email, major, businessName, timestamp
    });

    return res.status(200).json({
      success: true,
      message: 'Registration submitted successfully!'
    });

  } catch (error) {
    console.error('Submission error:', error);
    return res.status(500).json({
      error: 'Internal server error. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
