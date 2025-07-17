# NEST FEST Registration System

A comprehensive registration platform for Austin Community College's NEST FEST entrepreneurship event, featuring AI-powered content generation, multi-role involvement tracking, and secure admin management.

## Live Demo

**Production Site**: [https://acc-shark-tank.vercel.app](https://acc-shark-tank.vercel.app)

## Features

### Core Functionality
- **6 Involvement Types**: Student Entrepreneur, Mentor, Judge, Volunteer, Audience Member, General Interest
- **AI-Powered Content Generation**: Claude API integration with comprehensive fallback templates
- **Multi-Role Participation Hub**: Centralized involvement management system
- **Secure Admin Dashboard**: Role-based access with session management
- **Professional Email System**: Branded SendGrid confirmations for all involvement types

### Technical Features
- **Real-time Form Validation** - XSS protection with DOMPurify
- **Google Sheets Integration** - Automatic data collection and storage
- **Rate Limiting** - 10 AI generations/hour, 3 submissions/hour per IP
- **Responsive Design** - Mobile-friendly Austin Community College branding
- **Enterprise Security** - Iron Session, bcrypt, comprehensive CSP headers

## Tech Stack

### Frontend
- **Languages**: HTML5, CSS3, Vanilla JavaScript (NO frameworks)
- **Security**: DOMPurify for XSS prevention
- **Architecture**: Static site with direct script inclusion

### Backend
- **Platform**: Vercel Serverless Functions (Node.js)
- **Module System**: CommonJS (require/module.exports)
- **Database**: Google Sheets API integration
- **Authentication**: Iron Session with bcrypt
- **Email**: SendGrid integration
- **AI**: Claude API for content generation

### Infrastructure
- **Hosting**: Vercel Platform
- **Node Version**: >=18.0.0
- **Deployment**: Vercel CLI
- **Environment**: Production-ready with comprehensive security headers

## Project Structure

```
/api/                    # Vercel serverless functions
  claude-generate.js     # AI content generation endpoint
  submit.js             # Main registration submission
  login.js              # Admin authentication
  session.js            # Session management
  submissions.js        # Admin data retrieval
  participate.js        # Multi-role involvement handler
  ai-coaching.js        # AI coaching functionality
  usage-check.js        # Rate limiting checks
  debug.js              # Debug utilities
  test-claude.js        # Claude API testing

/lib/                    # Shared libraries (CommonJS)
  sheets.js             # Google Sheets API client
  auth.js               # Iron Session configuration

/admin/                  # Admin interface
  dashboard.html        # Admin submission management

/js/                     # Frontend JavaScript
  ai-coach.js           # AI coaching interface

/styles/                 # CSS stylesheets
  main.css              # Main application styles

/scripts/                # Utility scripts
  diagnose-sheets.js    # Google Sheets diagnostics
  setup-admin.js        # Admin setup utility

# Root level pages
index.html              # Main registration form
quick-builder.html      # AI-powered content generator
participate.html        # Multi-role involvement hub
login.html             # Admin login
vercel.json            # Vercel configuration
package.json           # Dependencies and scripts
CLAUDE.md              # Development documentation
```

## Vercel Deployment Configuration

### Prerequisites
- **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
- **Node.js**: Version 18.0.0 or higher
- **Google Cloud Service Account**: For Sheets API access
- **SendGrid Account**: For email notifications
- **Anthropic API Key**: For Claude AI integration (optional)

### Environment Variables

The following environment variables must be configured in your Vercel dashboard:

#### Required Variables

**Google Sheets Integration**
```bash
GOOGLE_SHEET_ID=your_google_sheet_id_here
GOOGLE_CLIENT_EMAIL=service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"
```

**SendGrid Email Service**
```bash
SENDGRID_API_KEY=SG.your_sendgrid_api_key_here
SENDGRID_SENDER_EMAIL=verified_sender@your-domain.com
```

**Security Configuration**
```bash
SESSION_SECRET=your_32_character_minimum_secret_here
NODE_ENV=production
```

#### Optional Variables

**Claude AI Integration**
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your_anthropic_api_key_here
```

### Deployment Steps

#### 1. Install Vercel CLI
```bash
npm install -g vercel
```

#### 2. Clone and Setup
```bash
git clone https://github.com/your-username/acc-shark-tank.git
cd acc-shark-tank
npm install
```

#### 3. Configure Environment Variables
- Go to your Vercel dashboard
- Navigate to your project settings
- Add all required environment variables listed above

#### 4. Deploy to Vercel
```bash
# Deploy to staging
vercel deploy

# Deploy to production
vercel --prod
```

#### 5. Configure Domain (Optional)
- Add your custom domain in Vercel dashboard
- Update DNS records as instructed

### Vercel Configuration Details

The `vercel.json` file includes:

- **Serverless Functions**: Configured with appropriate timeouts
- **Security Headers**: CSP, XSS protection, frame options
- **CORS Settings**: API endpoint access control
- **Redirects**: SEO-friendly URL routing
- **Cache Control**: Optimized for performance

### Infrastructure Requirements

#### Google Sheets Setup
1. Create a Google Cloud project
2. Enable Google Sheets API
3. Create a service account
4. Download JSON credentials
5. Share your Google Sheet with the service account email
6. Extract `client_email` and `private_key` for environment variables

#### SendGrid Setup
1. Create SendGrid account
2. Verify sender email address
3. Generate API key with mail send permissions
4. Configure email templates (optional)

#### Security Considerations
- Use strong, unique `SESSION_SECRET`
- Regularly rotate API keys
- Monitor usage and access logs
- Enable two-factor authentication on all accounts

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
# or
vercel dev

# Access application
# Main form: http://localhost:3000
# AI Builder: http://localhost:3000/quick-builder.html
# Participation Hub: http://localhost:3000/participate.html
# Admin Login: http://localhost:3000/login.html
```

### Development Commands
```bash
# Start local development server
npm run dev

# Test build (no build step required)
npm run build

# Deploy to staging
vercel deploy

# Deploy to production
vercel --prod
```

### Code Standards
- **Module System**: Strict CommonJS (require/module.exports)
- **Security**: XSS protection on all inputs
- **Validation**: Server-side validation for all endpoints
- **Error Handling**: Comprehensive error responses
- **Rate Limiting**: Built-in protection against abuse

### Testing
- No automated test suite currently configured
- Manual testing recommended for all features
- Use debug endpoints for troubleshooting

## API Endpoints

### Public Endpoints
- `POST /api/submit` - Main registration submission
- `POST /api/participate` - Multi-role involvement submission
- `POST /api/claude-generate` - AI content generation
- `GET /api/usage-check` - Rate limiting status

### Admin Endpoints
- `POST /api/login` - Admin authentication
- `GET /api/session` - Session validation
- `GET /api/submissions` - Retrieve submissions data

### Debug Endpoints
- `GET /api/debug` - System diagnostics
- `POST /api/test-claude` - Claude API testing

## Database Schema

### Google Sheets Structure
The system uses Google Sheets with the following columns:

**Main Registration Sheet**
- Timestamp, Name, Email, Phone, Business Name, Business Description, Industry, Stage, Team Size, Funding Needed, IP Address

**Participation Sheet**
- Timestamp, Name, Email, Phone, Involvement Type, Organization, Experience, Additional Info, IP Address

**AI Usage Tracking Sheet**
- Timestamp, IP Address, Generation Type, Success Status, Content Length

## Rate Limiting

### Current Limits
- **AI Generation**: 10 requests per hour per IP
- **Form Submission**: 3 submissions per hour per IP
- **Admin Login**: 5 attempts per hour per IP

### Implementation
- IP-based tracking using Google Sheets
- Automatic cleanup of old entries
- Graceful degradation with fallback templates

## Troubleshooting

### Common Issues

**Environment Variables**
- Ensure all required variables are set in Vercel dashboard
- Check `GOOGLE_PRIVATE_KEY` formatting (literal \n characters)
- Verify SendGrid sender email is verified

**Google Sheets Access**
- Confirm service account has access to sheet
- Check `GOOGLE_SHEET_ID` is correct
- Verify Google Sheets API is enabled

**Claude API Integration**
- Optional feature - system works without it
- Fallback templates provide comprehensive content
- Check API key format and permissions

### Debug Tools
- Use `/api/debug` endpoint for system diagnostics
- Check Vercel function logs for detailed errors
- Monitor Google Sheets API usage quotas

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch
3. Follow CommonJS module standards
4. Test locally with `npm run dev`
5. Submit pull request

### Code Review Checklist
- [ ] CommonJS modules used consistently
- [ ] Security headers implemented
- [ ] Input validation added
- [ ] Error handling comprehensive
- [ ] Rate limiting respected
- [ ] Documentation updated

## License

This project is developed for Austin Community College's NEST FEST event.

## Support

For technical issues or questions:
- Check the troubleshooting section above
- Review Vercel function logs
- Contact the development team

---

**Production Site**: [https://acc-shark-tank.vercel.app](https://acc-shark-tank.vercel.app)

**Last Updated**: July 2025