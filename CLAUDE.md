# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Primary Commands
- `npm run dev` - Start Vercel development server for local testing
- `npm run build` - No build step required (static site with serverless functions)
- `vercel dev` - Alternative local development command
- `vercel deploy` - Deploy to Vercel (staging)
- `vercel --prod` - Deploy to production

### Deployment Notes
- No test suite is currently configured
- Vercel serverless functions in `/api` directory
- Production site: https://acc-shark-tank.vercel.app

## Architecture Overview

This is a **NEST FEST** (Austin Community College entrepreneurship event) registration system with AI-powered content generation capabilities.

### Core Technologies
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (NO frameworks)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Google Sheets API integration
- **AI Integration**: Claude API for content generation
- **Security**: Iron Session, DOMPurify, bcrypt
- **Email**: SendGrid integration

### Module System
- **STRICT CommonJS**: Use `require()` and `module.exports` - NO ES6 modules
- **Shared Libraries**: Always use `lib/sheets.js` and `lib/auth.js` for common functionality
- **No Frontend Bundling**: Direct script inclusion in HTML

### Project Structure
```
/api/                    # Vercel serverless functions
  claude-generate.js     # AI content generation endpoint
  submit.js             # Main registration submission
  login.js              # Admin authentication
  session.js            # Session management
  submissions.js        # Admin data retrieval
  participate.js        # Multi-role involvement handler

/lib/                    # Shared libraries (CommonJS)
  sheets.js             # Google Sheets API client
  auth.js               # Iron Session configuration

/admin/                  # Admin interface
  dashboard.html        # Admin submission management

# Root level pages
index.html              # Main registration form
quick-builder.html      # AI-powered content generator
participate.html        # Multi-role involvement hub
login.html             # Admin login
```

### Key Features
- **6 Involvement Types**: Student Entrepreneur, Mentor, Judge, Volunteer, Audience Member, General Interest
- **AI Content Generation**: Claude API integration with comprehensive fallback templates
- **Rate Limiting**: 10 AI generations/hour, 3 submissions/hour per IP
- **Secure Admin System**: Role-based access with session management
- **Professional Email**: Branded SendGrid confirmations for all involvement types

## Environment Variables (Required)

### Google Sheets Integration
```
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### SendGrid Email
```
SENDGRID_API_KEY=SG.your_sendgrid_api_key
SENDGRID_SENDER_EMAIL=verified_sender@domain.com
```

### Security
```
SESSION_SECRET=32_character_minimum_secret
NODE_ENV=development|production
```

### Optional Claude AI
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Code Standards

### Header Format
```javascript
/* *******************************
 * Module Description
 * Additional context
 * 
 * @author NEST FEST Development Team
 * @version X.X
 * @date July 2025
 *******************************/
```

### Function Comments
- Place method comments **within** functions, not outside
- Use detailed JSDoc-style comments for complex logic

### Branding
- Use "NEST FEST" consistently (not "ACC Shark Tank")
- Maintain Austin Community College branding in UI

### Security Practices
- Input validation and XSS protection on all endpoints
- Rate limiting on API endpoints
- Secure session configuration
- No secrets in code or commits

## Known Issues

### Current Technical Problem
- **File**: `api/claude-generate.js:127:20`
- **Issue**: `res.status is not a function` in Vercel serverless environment
- **Status**: Working locally, failing in production deployment
- **Cause**: Vercel serverless response object incompatibility

### Vercel Serverless Function Compatibility
When working with serverless functions, ensure response handling uses Vercel-compatible patterns rather than standard Node.js HTTP response methods.

## Development Workflow

1. **Incremental Development**: Small, committable steps
2. **Explicit Approval**: Confirm before proceeding with major changes
3. **CommonJS Only**: No ES6 modules anywhere in the codebase
4. **Shared Library Usage**: Always use `lib/sheets.js` and `lib/auth.js`
5. **Local Testing**: Use `npm run dev` for development
6. **Production Deployment**: Use Vercel CLI for staging/production

## AI Content Generation System

### Enhanced Template System
- Comprehensive fallback templates when Claude API unavailable
- Professional business descriptions (2000+ characters)
- Industry-specific content generation
- Three-question workflow for optimal results

### Rate Limiting
- 10 AI generations per hour per IP address
- Graceful fallback to enhanced templates
- Production-ready error handling