/* ****************************************
 * Initial Admin User Setup Script
 * Creates the first superadmin account for ACC Shark Tank system
 * 
 * @author ACC Development Team
 * @version 1.0
 * @date July 2025
 * @note Run this script once to create the initial admin account
 * @note Requires GOOGLE_SHEET_ID and Google Sheets credentials to be configured
 ****************************************/

const bcrypt = require('bcrypt');
const { createSheetsClient, getSheetValues, appendSheetValues } = require('../lib/sheets');

/**
 * Create initial admin user in Google Sheets
 * @param {string} email - Admin email address
 * @param {string} password - Admin password (will be hashed)
 * @param {string} name - Admin name
 * @returns {Promise<void>}
 */
async function createInitialAdmin(email, password, name) {
    try {
        console.log('🚀 Setting up initial admin user...');

        // Validate inputs
        if (!email || !password || !name) {
            throw new Error('Email, password, and name are required');
        }

        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }

        // Create Google Sheets client
        console.log('📊 Connecting to Google Sheets...');
        const sheets = await createSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        if (!spreadsheetId) {
            throw new Error('GOOGLE_SHEET_ID environment variable not configured');
        }

        // Check if Users sheet exists and has headers
        try {
            const existingUsers = await getSheetValues(sheets, spreadsheetId, 'Users!A1:G1');
            
            if (existingUsers.length === 0) {
                console.log('📝 Creating Users sheet headers...');
                // Add headers if they don't exist
                await appendSheetValues(sheets, spreadsheetId, 'Users!A1:G1', [
                    'Email', 'Password', 'Role', 'Name', 'Created', 'LastLogin', 'Status'
                ]);
            }
        } catch (error) {
            console.log('📝 Creating Users sheet with headers...');
            // Sheet might not exist, create headers
            await appendSheetValues(sheets, spreadsheetId, 'Users!A1:G1', [
                'Email', 'Password', 'Role', 'Name', 'Created', 'LastLogin', 'Status'
            ]);
        }

        // Check if admin already exists
        console.log('🔍 Checking for existing admin users...');
        const existingUsers = await getSheetValues(sheets, spreadsheetId, 'Users!A2:G');
        const adminExists = existingUsers.some(row => 
            row[0] && row[0].toLowerCase() === email.toLowerCase()
        );

        if (adminExists) {
            console.log('⚠️  Admin user with this email already exists!');
            return;
        }

        // Hash password
        console.log('🔐 Hashing password...');
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create admin user record
        const timestamp = new Date().toISOString();
        const adminRecord = [
            email.toLowerCase(),        // Email
            hashedPassword,             // Password (hashed)
            'superadmin',              // Role
            name,                      // Name
            timestamp,                 // Created
            '',                        // LastLogin (empty initially)
            'active'                   // Status
        ];

        // Add admin to sheet
        console.log('👤 Creating admin user...');
        await appendSheetValues(sheets, spreadsheetId, 'Users!A:G', adminRecord);

        console.log('✅ Initial admin user created successfully!');
        console.log('📧 Email:', email);
        console.log('👤 Name:', name);
        console.log('🛡️  Role: superadmin');
        console.log('');
        console.log('🔑 You can now login at: /login.html');
        console.log('📊 Access dashboard at: /admin/dashboard.html');

    } catch (error) {
        console.error('❌ Failed to create initial admin:', error.message);
        throw error;
    }
}

/**
 * Interactive CLI setup for admin creation
 */
async function interactiveSetup() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    function question(query) {
        return new Promise(resolve => rl.question(query, resolve));
    }

    try {
        console.log('🚀 ACC Shark Tank Admin Setup');
        console.log('===============================\n');

        const email = await question('Enter admin email address: ');
        const name = await question('Enter admin full name: ');
        
        // Hide password input
        process.stdout.write('Enter admin password (8+ characters): ');
        const password = await new Promise(resolve => {
            const stdin = process.stdin;
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');
            
            let password = '';
            stdin.on('data', function(char) {
                char = char + '';
                switch(char) {
                    case '\n':
                    case '\r':
                    case '\u0004':
                        stdin.setRawMode(false);
                        stdin.pause();
                        console.log('\n');
                        resolve(password);
                        break;
                    case '\u0003':
                        process.exit();
                        break;
                    default:
                        password += char;
                        process.stdout.write('*');
                        break;
                }
            });
        });

        console.log('\n📝 Summary:');
        console.log('Email:', email);
        console.log('Name:', name);
        console.log('Password: [hidden]');
        
        const confirm = await question('\nCreate this admin user? (y/N): ');
        
        if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            await createInitialAdmin(email, password, name);
        } else {
            console.log('Setup cancelled.');
        }

    } catch (error) {
        console.error('Setup failed:', error.message);
    } finally {
        rl.close();
    }
}

// Run setup if called directly
if (require.main === module) {
    // Check if environment is configured
    if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        console.error('❌ Missing required environment variables:');
        console.error('   - GOOGLE_SHEET_ID');
        console.error('   - GOOGLE_CLIENT_EMAIL');
        console.error('   - GOOGLE_PRIVATE_KEY');
        console.error('');
        console.error('Please configure these in your .env file first.');
        process.exit(1);
    }

    // Check for command line arguments
    const args = process.argv.slice(2);
    if (args.length >= 3) {
        // Direct setup with CLI args
        const [email, password, name] = args;
        createInitialAdmin(email, password, name)
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    } else {
        // Interactive setup
        interactiveSetup()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    }
}
module.exports = { createInitialAdmin };