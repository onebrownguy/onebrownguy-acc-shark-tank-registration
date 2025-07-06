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
 * @param (object) req : HTTP request object containing form data
 * @param (object) res : HTTP response object for sending responses
 * @return na : sends JSON response to client
 * @note Handles CORS, validation, and Google Sheets integration
 ****************************************/
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  /* ****************************************
   * Handle preflight CORS request
   * @param na : checks request method
   * @return na : ends response for OPTIONS requests
   ****************************************/
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  /* ****************************************
   * Validate HTTP method is POST
   * @param na : checks request method
   * @return (JSON) : error response if not POST
   ****************************************/
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fullName, email, major, businessName, businessDescription } = req.body;

    /* ****************************************
     * Validate all required fields are present
     * @param na : checks extracted form fields
     * @return (JSON) : error response if fields missing
     ****************************************/
    if (!fullName || !email || !major || !businessName || !businessDescription) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    /* ****************************************
     * Validate email format using regex
     * @param (string) email : email address to validate
     * @return (JSON) : error response if invalid email format
     ****************************************/
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    /* ****************************************
     * Set up Google Sheets API authentication
     * @param na : uses environment variables for credentials
     * @return (object) : authenticated Google Sheets client
     * @note Uses service account authentication
     ****************************************/
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    /* ****************************************
     * Format timestamp for Central Time (Austin)
     * @param na : uses current date/time
     * @return (string) : formatted timestamp string
     ****************************************/
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    /* ****************************************
     * Prepare data array for Google Sheets insertion
     * @param na : uses form data and timestamp
     * @return (array) : 2D array formatted for Sheets API
     ****************************************/
    const values = [[
      timestamp,
      fullName,
      email,
      major,
      businessName,
      businessDescription
    ]];

    /* ****************************************
     * Check if spreadsheet has headers, add if missing
     * @param na : checks first row of spreadsheet
     * @return na : adds headers if spreadsheet is empty
     * @exception Continues if header check fails
     ****************************************/
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Sheet1!A1:F1',
      });

      // If no data exists, add headers first
      if (!response.data.values || response.data.values.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Sheet1!A1:F1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [['Timestamp', 'Full Name', 'Email', 'Major', 'Business Name', 'Business Description']]
          }
        });
      }
    } catch (error) {
      console.log('Could not check for headers, proceeding with data insertion');
    }

    /* ****************************************
     * Append registration data to Google Sheets
     * @param (array) values : form data to insert
     * @return na : inserts new row in spreadsheet
     * @exception Throws error if Sheets API call fails
     ****************************************/
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:F',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values


      }
    });

    /* ****************************************
    * Send confirmation email to registrant
    * @param (string) email : recipient email address
    * @param (string) fullName : recipient name
    * @return na : sends email confirmation
    * @exception Logs error but continues if email fails
    ****************************************/    
    try {
      const confirmationEmail = {
        to: email,
        from: process.env.SENDGRID_SENDER_EMAIL,
        subject: 'ACC Shark Tank Registration Confirmation',
        html: `<h2>Registration Confirmed!</h2><p>Dear ${fullName}, thank you for registering for ACC Shark Tank with ${businessName}.</p>`
      };
      
      await sgMail.send(confirmationEmail);
      console.log('Email sent to:', email);
    } catch (emailError) {
      console.error('Email failed:', emailError);
    }
    
    

    /* ****************************************
     * Log successful registration for monitoring
     * @param na : logs key registration details
     * @return na : console output for debugging
     ****************************************/
    console.log('Successfully added registration to Google Sheets:', {
      fullName,
      email,
      major,
      businessName,
      timestamp
    });

    /* ****************************************
     * Send success response to client
     * @param na : confirms successful registration
     * @return (JSON) : success message and status
     ****************************************/
    return res.status(200).json({ 
      success: true, 
      message: 'Registration submitted successfully!' 
    });

  } catch (error) {
    /* ****************************************
     * Handle and log any errors during processing
     * @param (Error) error : caught exception
     * @return (JSON) : error response to client
     * @note Includes error details in development mode only
     ****************************************/
    console.error('Submission error:', error);
    return res.status(500).json({ 
      error: 'Internal server error. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}