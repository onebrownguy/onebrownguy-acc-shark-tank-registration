/* *******************************
 * Claude AI Content Generation API Handler
 * Handles AI-powered content generation for NEST FEST quick-builder tool
 * 
 * @author NEST FEST Development Team
 * @version 2.1 - Vercel Serverless Compatible
 * @date July 2025
 * @note Integrates with Claude API for content generation with enhanced fallback templates
 * @note Uses CommonJS modules for consistency with codebase
 * @note Includes rate limiting and security measures
 * @note Enhanced templates provide comprehensive, usable content for students
 * @note Fixed for Vercel serverless function compatibility
 *******************************/

const { createSheetsClient, appendSheetValues } = require('../lib/sheets');

/**
 * Handle AI content generation requests
 */
async function claudeGenerateHandler(req, res) {
    /* *******************************
     * Process AI content generation requests with fallback handling
     * @param req : request object containing generation parameters
     * @param res : response object for sending generated content
     * @return : JSON response with generated content or error
     *******************************/
    
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
        const { type, inputs } = req.body;

        // Validate request structure
        if (!type || !inputs) {
            return res.status(400).json({ 
                error: 'Missing required fields: type and inputs',
                code: 'MISSING_FIELDS' 
            });
        }

        // Validate content type
        const validTypes = ['business_description', 'pitch_outline', 'executive_summary', 'presentation_slides'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ 
                error: 'Invalid content type',
                code: 'INVALID_TYPE',
                validTypes 
            });
        }

        // Rate limiting check
        const clientId = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
        if (await isRateLimited(clientId)) {
            return res.status(429).json({ 
                error: 'Too many generation requests. Please try again later.',
                code: 'RATE_LIMITED' 
            });
        }

        console.log(`AI generation request: ${type} from ${clientId}`);

        /* *******************************
         * Attempt Claude API generation with fallback
         *******************************/
        
        let generatedContent;
        let usedAI = false;

        try {
            // Try Claude API first
            if (process.env.ANTHROPIC_API_KEY) {
                generatedContent = await generateWithClaudeAPI(type, inputs);
                usedAI = true;
                console.log(`Claude API generation successful for type: ${type}`);
            } else {
                throw new Error('Claude API not configured');
            }
        } catch (apiError) {
            console.warn(`Claude API failed, using fallback: ${apiError.message}`);
            // Fallback to template-based generation
            generatedContent = await generateWithTemplate(type, inputs);
            usedAI = false;
        }

        /* *******************************
         * Log generation for analytics (optional)
         *******************************/
        
        if (process.env.GOOGLE_SHEET_ID && process.env.LOG_AI_USAGE) {
            try {
                await logAIUsage(type, inputs, usedAI, clientId);
            } catch (logError) {
                console.warn('Failed to log AI usage:', logError.message);
                // Don't fail the request if logging fails
            }
        }

        // Record successful generation for rate limiting
        await recordGeneration(clientId);

        return res.status(200).json({
            success: true,
            content: generatedContent,
            metadata: {
                type,
                generatedBy: usedAI ? 'claude-api' : 'template',
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Content generation error:', error.message);
        
        return res.status(500).json({ 
            error: 'Failed to generate content. Please try again.',
            code: 'GENERATION_ERROR' 
        });
    }
}

/**
 * Generate content using Claude API
 */
async function generateWithClaudeAPI(type, inputs) {
    /* *******************************
     * Call Claude API for AI-powered content generation
     * @param type : content type to generate
     * @param inputs : user-provided content inputs
     * @return : generated content string
     *******************************/
    
    const prompt = buildClaudePrompt(type, inputs);
    
    // Use built-in fetch (Node.js 18+) or require a fetch polyfill
    const fetch = globalThis.fetch || require('node-fetch');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 1500,
            messages: [{
                role: 'user',
                content: prompt
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

/**
 * Build appropriate prompt for Claude based on content type
 */
function buildClaudePrompt(type, inputs) {
    /* *******************************
     * Construct specialized prompts for different content types
     * @param type : content type to generate
     * @param inputs : user-provided content inputs
     * @return : formatted prompt string for Claude
     *******************************/
    
    const baseContext = "You are helping a student create professional content for a NEST FEST entrepreneurship pitch presentation. Be encouraging, professional, and focus on practical business value. Create comprehensive, detailed content that students can actually use.";

    switch (type) {
        case 'business_description':
            return `${baseContext}

Create a comprehensive business description (500-800 words) based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem being solved: ${inputs.problem || 'Not provided'}
- What they're seeking: ${inputs.needs || 'Not provided'}

Include sections for:
- Business concept overview
- Problem description
- Solution approach
- Market opportunity
- Competitive advantage
- Revenue model
- What they're seeking
- Next steps

Format as a professional business description suitable for a pitch presentation.`;

        case 'pitch_outline':
            return `${baseContext}

Create a detailed 5-minute pitch outline based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem: ${inputs.problem || 'Not provided'}
- Target market: ${inputs.market || 'Not provided'}
- Competitive advantage: ${inputs.advantage || 'Not provided'}

Provide a structured outline with timing suggestions, speaking points, and delivery tips for each section.`;

        case 'executive_summary':
            return `${baseContext}

Create a comprehensive executive summary (1-2 pages) based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem: ${inputs.problem || 'Not provided'}
- Solution: ${inputs.solution || 'Not provided'}
- Market opportunity: ${inputs.market || 'Not provided'}
- Financial projections: ${inputs.financials || 'Not provided'}

Format as a professional executive summary suitable for investors.`;

        case 'presentation_slides':
            return `${baseContext}

Create detailed slide content suggestions based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem: ${inputs.problem || 'Not provided'}
- Solution: ${inputs.solution || 'Not provided'}

Suggest 10-12 slide topics with detailed content descriptions, talking points, and visual suggestions for each slide.`;

        default:
            return `${baseContext}

Create comprehensive professional business content based on the provided information: ${JSON.stringify(inputs)}`;
    }
}

/**
 * Generate content using template-based fallback
 */
async function generateWithTemplate(type, inputs) {
    /* *******************************
     * Fallback content generation using enhanced templates
     * @param type : content type to generate
     * @param inputs : user-provided content inputs
     * @return : template-generated content string
     *******************************/
    
    switch (type) {
        case 'business_description':
            return generateBusinessDescriptionTemplate(inputs);
        case 'pitch_outline':
            return generatePitchOutlineTemplate(inputs);
        case 'executive_summary':
            return generateExecutiveSummaryTemplate(inputs);
        case 'presentation_slides':
            return generatePresentationSlidesTemplate(inputs);
        default:
            return generateGenericTemplate(inputs);
    }
}

/**
 * Enhanced template generators for each content type
 */
function generateBusinessDescriptionTemplate(inputs) {
    // Expand and enhance user inputs with professional context
    const concept = inputs.concept || '[Your business concept]';
    const problem = inputs.problem || '[Problem description]';
    const solution = inputs.solution || generateSolutionFromConcept(concept, problem);
    const needs = inputs.needs || '[Funding/resources needed]';
    
    return `BUSINESS CONCEPT
${concept}

Our innovative approach addresses a critical market need through technology-driven solutions that create meaningful value for our target customers.

THE PROBLEM WE'RE SOLVING
${problem}

This challenge affects thousands of potential customers and represents a significant market opportunity. Current solutions are either too expensive, too complex, or simply don't exist, creating a clear opening for our innovative approach.

OUR SOLUTION
${solution}

By leveraging modern technology and user-centered design, we provide a streamlined, cost-effective solution that directly addresses the core problem while delivering exceptional user experience.

MARKET OPPORTUNITY
Our target market consists of individuals and businesses who currently struggle with this problem. Based on market research, this represents a substantial opportunity with strong growth potential.

COMPETITIVE ADVANTAGE
- Innovative technology approach
- Cost-effective pricing model  
- User-friendly design
- Scalable business model
- Strong team expertise

WHAT WE'RE SEEKING
${needs}

With the right funding and support, we plan to:
- Develop and refine our minimum viable product
- Conduct market validation and testing
- Build strategic partnerships
- Scale our operations
- Capture significant market share

REVENUE MODEL
We plan to generate revenue through:
- Direct sales to customers
- Subscription-based services
- Partnership agreements
- Licensing opportunities

NEXT STEPS
- Complete product development
- Launch pilot program
- Gather customer feedback
- Refine business model
- Scale operations

This represents a significant opportunity to make a meaningful impact while building a sustainable and profitable business. Our team is committed to delivering innovative solutions that address real market needs and create value for all stakeholders.

Ready to turn this vision into reality at NEST FEST!`;
}

// Helper function to generate solution based on concept and problem
function generateSolutionFromConcept(concept, problem) {
    if (concept.toLowerCase().includes('app') || concept.toLowerCase().includes('digital') || concept.toLowerCase().includes('platform') || concept.toLowerCase().includes('manager')) {
        return `We are developing a digital platform that streamlines processes and improves efficiency. Our solution combines user-friendly technology with practical functionality to solve ${problem} in an innovative way.`;
    } else if (concept.toLowerCase().includes('service')) {
        return `We provide specialized services that directly address ${problem}. Our approach combines expertise, efficiency, and customer focus to deliver superior results.`;
    } else if (concept.toLowerCase().includes('product')) {
        return `We are creating a physical product that solves ${problem} through innovative design and functionality. Our solution is both practical and affordable.`;
    } else {
        return `Our innovative business model directly tackles ${problem} by providing a comprehensive solution that is both effective and scalable. We combine industry expertise with modern approaches to deliver exceptional value.`;
    }
}

function generatePitchOutlineTemplate(inputs) {
    const concept = inputs.concept || '[Your business concept]';
    const problem = inputs.problem || '[Problem description]';
    const market = inputs.market || 'individuals and businesses facing this challenge';
    const advantage = inputs.advantage || 'innovative approach and superior execution';
    const funding = inputs.funding || '[Amount needed]';
    
    return `NEST FEST PITCH OUTLINE (5 minutes)

1. HOOK & PROBLEM (45 seconds)
   - Start with: "${problem}"
   - Make it relatable: "How many of you have experienced this frustration?"
   - Quantify the impact: "This affects X number of people daily"
   - Create urgency: "The cost of inaction is significant"

2. SOLUTION INTRODUCTION (60 seconds)
   - Introduce your concept: "${concept}"
   - Explain how it works simply
   - Show the "aha moment" - why this solves the problem
   - Demonstrate key benefits

3. MARKET OPPORTUNITY (45 seconds)
   - Target market: ${market}
   - Market size: "This represents a $X billion opportunity"
   - Growth trends: "The market is growing at X% annually"
   - Your addressable market: "We can capture X% within 3 years"

4. PRODUCT DEMONSTRATION (90 seconds)
   - Show your prototype/demo
   - Walk through user experience
   - Highlight key features and benefits
   - Show customer testimonials or validation

5. BUSINESS MODEL & TRACTION (45 seconds)
   - Revenue streams: How you make money
   - Pricing strategy: What customers pay
   - Current traction: Users, revenue, partnerships
   - Growth projections: Where you're headed

6. COMPETITIVE ADVANTAGE (30 seconds)
   - What makes you different: ${advantage}
   - Barriers to entry you've created
   - Why you'll win in this market

7. FUNDING REQUEST & USE (30 seconds)
   - Amount seeking: ${funding}
   - Specific use of funds:
     * Product development: 40%
     * Marketing: 30%
     * Team expansion: 20%
     * Operations: 10%
   - Milestones you'll achieve
   - Return potential for investors

8. CALL TO ACTION (15 seconds)
   - Clear ask: "We're seeking $X for X% equity"
   - Next steps: "Let's discuss how you can be part of this opportunity"
   - Contact information
   - Thank you

DELIVERY TIPS:
- Practice timing with a stopwatch
- Use visuals and props
- Tell a story, don't just present facts
- Make eye contact with judges
- Show passion and confidence
- End with energy and clear next steps
- Prepare for Q&A session

SUCCESS METRICS:
- Judges understand the problem clearly
- Solution seems obvious and needed
- Market opportunity is compelling
- You appear capable of execution
- Financial projections are realistic
- Investment opportunity is attractive`;
}

function generateExecutiveSummaryTemplate(inputs) {
    const businessName = inputs.businessName || '[Business Name]';
    const concept = inputs.concept || '[Business concept]';
    const problem = inputs.problem || '[Problem description]';
    const solution = inputs.solution || generateSolutionFromConcept(concept, problem);
    const market = inputs.market || '[Target market and size]';
    const advantage = inputs.advantage || '[Competitive advantage]';
    const financials = inputs.financials || '[Financial projections]';
    const funding = inputs.funding || '[Funding amount]';
    
    return `EXECUTIVE SUMMARY

COMPANY OVERVIEW
${businessName} is an innovative startup focused on ${concept}. We are addressing a significant market opportunity through technology-driven solutions that create measurable value for our customers.

PROBLEM & MARKET OPPORTUNITY
${problem}

This challenge represents a substantial market opportunity with clear demand from our target customers. Current solutions are inadequate, creating a significant opening for our innovative approach.

Target Market: ${market}
Market Size: Multi-billion dollar opportunity with strong growth potential
Customer Segments: Multiple customer types with varying needs and price points

SOLUTION & VALUE PROPOSITION
${solution}

Our solution provides:
- Significant cost savings for customers
- Improved efficiency and user experience
- Scalable technology platform
- Competitive pricing model
- Superior customer support

COMPETITIVE ADVANTAGE
${advantage}

Key differentiators include:
- Proprietary technology and processes
- First-mover advantage in key market segments
- Strong team with relevant expertise
- Strategic partnerships and relationships
- Scalable business model with high margins

BUSINESS MODEL & REVENUE STREAMS
Primary Revenue Sources:
- Direct sales to end customers
- Subscription-based recurring revenue
- Partnership and licensing agreements
- Premium service offerings

Our model provides predictable recurring revenue with strong unit economics and scalability.

FINANCIAL PROJECTIONS
${financials}

Conservative projections show:
- Year 1: $250,000 revenue
- Year 2: $1,500,000 revenue  
- Year 3: $5,000,000 revenue
- Break-even: Month 18
- Positive cash flow: Year 2

Key metrics demonstrate strong growth potential with reasonable assumptions.

TEAM & EXECUTION
Our team combines relevant industry experience with entrepreneurial drive:
- Strong technical capabilities
- Proven business development skills
- Deep market knowledge
- Commitment to execution excellence

FUNDING REQUEST
${funding}

Use of Funds:
- Product Development: 40%
- Marketing & Sales: 30%
- Team Expansion: 20%
- Operations & Infrastructure: 10%

This funding will enable us to achieve key milestones including product launch, customer acquisition, and market expansion.

INVESTMENT OPPORTUNITY
This represents a compelling investment opportunity with:
- Large addressable market
- Strong competitive position
- Experienced team
- Clear path to profitability
- Significant growth potential
- Multiple exit opportunities

We are seeking strategic investors who can provide not just capital, but also guidance, connections, and expertise to help us scale rapidly and capture market share.

NEXT STEPS
- Complete Series A funding round
- Launch product to market
- Scale customer acquisition
- Expand team and operations
- Achieve key growth milestones
- Prepare for future funding rounds

Contact: [Contact Information]
Website: [Website URL]
Email: [Email Address]`;
}

function generatePresentationSlidesTemplate(inputs) {
    const businessName = inputs.businessName || '[Business Name]';
    const concept = inputs.concept || '[Business concept]';
    const problem = inputs.problem || '[Problem description]';
    const solution = inputs.solution || generateSolutionFromConcept(concept, problem);
    const funding = inputs.funding || '[Amount needed]';
    
    return `NEST FEST PRESENTATION SLIDES

SLIDE 1: TITLE SLIDE
- Company name: ${businessName}
- Tagline: "[Compelling one-liner about your solution]"
- Your name and title
- NEST FEST logo
- Date

Visual: Clean, professional design with your logo

SLIDE 2: THE PROBLEM
- Headline: "The Problem"
- Main point: ${problem}
- Supporting statistics or examples
- Why this matters now
- Cost of current solutions

Visual: Infographic showing the problem's impact

SLIDE 3: MARKET OPPORTUNITY
- Headline: "Market Opportunity"
- Market size: "$X billion market"
- Growth rate: "Growing at X% annually"
- Target customers: "X million potential customers"
- Timing: "Why now is the right time"

Visual: Market size charts and growth projections

SLIDE 4: OUR SOLUTION
- Headline: "Our Solution"
- Main concept: ${concept}
- How it works: ${solution}
- Key benefits (3-4 bullet points)
- Unique value proposition

Visual: Product mockup or demo screenshot

SLIDE 5: PRODUCT DEMO
- Headline: "How It Works"
- Step-by-step user journey
- Key features highlighted
- User interface screenshots
- Customer testimonials

Visual: Product screenshots or live demo

SLIDE 6: BUSINESS MODEL
- Headline: "How We Make Money"
- Revenue streams
- Pricing strategy
- Unit economics
- Scalability factors

Visual: Revenue model diagram

SLIDE 7: COMPETITIVE ADVANTAGE
- Headline: "Why We'll Win"
- Current alternatives and their limitations
- Our unique advantages
- Barriers to entry we're creating
- Intellectual property

Visual: Competitive comparison chart

SLIDE 8: TRACTION & VALIDATION
- Headline: "Proven Demand"
- Customer feedback
- Early sales/users
- Partnership agreements
- Market validation

Visual: Growth charts and customer logos

SLIDE 9: FINANCIAL PROJECTIONS
- Headline: "Financial Forecast"
- 3-year revenue projections
- Key assumptions
- Break-even timeline
- Return on investment

Visual: Financial charts and graphs

SLIDE 10: TEAM
- Headline: "The Team"
- Founder backgrounds
- Key team members
- Relevant experience
- Advisory board

Visual: Professional headshots with credentials

SLIDE 11: FUNDING REQUEST
- Headline: "Investment Opportunity"
- Amount seeking: ${funding}
- Use of funds breakdown
- Milestones to achieve
- Equity offered
- Expected return

Visual: Use of funds pie chart

SLIDE 12: CALL TO ACTION
- Headline: "Let's Make This Happen"
- Clear next steps
- Contact information
- Website/demo link
- Thank you message

Visual: Strong closing image with contact details

PRESENTATION TIPS:
- Keep slides visual and minimal text
- Practice timing (30-45 seconds per slide)
- Use consistent design and fonts
- Include your logo on every slide
- Prepare for technical difficulties
- Have backup plans ready
- End with confidence and energy

APPENDIX SLIDES (Have Ready):
- Detailed financial model
- Technical specifications
- Additional market research
- Team resumes
- Customer testimonials
- Partnership agreements`;
}

function generateGenericTemplate(inputs) {
    const concept = inputs.concept || '[Business concept]';
    const problem = inputs.problem || '[Problem description]';
    const needs = inputs.needs || '[Funding/resources needed]';
    
    return `PROFESSIONAL BUSINESS CONTENT

OVERVIEW
Based on your input, here's a comprehensive business overview for ${concept}.

BUSINESS CONCEPT
${concept}

This innovative approach addresses market needs through strategic execution and value creation.

CHALLENGE ADDRESSED
${problem}

This represents a significant opportunity to provide solutions where current options are inadequate or non-existent.

KEY ELEMENTS
${Object.entries(inputs).map(([key, value]) => `- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`).join('\n')}

STRATEGIC APPROACH
Our methodology combines industry best practices with innovative thinking to deliver exceptional results. We focus on:

- Market-driven solutions
- Customer-centric design
- Scalable business model
- Sustainable competitive advantage
- Strong execution capabilities

VALUE PROPOSITION
We provide unique value through our comprehensive approach that addresses core market needs while delivering measurable results for all stakeholders.

RESOURCE REQUIREMENTS
${needs}

With appropriate resources and support, we can achieve significant milestones and capture meaningful market share.

NEXT STEPS
- Validate market assumptions
- Develop minimum viable product
- Test with target customers
- Refine business model
- Scale operations
- Build strategic partnerships

This comprehensive approach positions us for success in the competitive marketplace while creating sustainable value for customers, investors, and the broader community.

Ready to turn this vision into reality at NEST FEST!`;
}

/**
 * Log AI usage for analytics
 */
async function logAIUsage(type, inputs, usedAI, clientId) {
    /* *******************************
     * Record AI usage statistics in Google Sheets
     * @param type : content type generated
     * @param inputs : input parameters used
     * @param usedAI : whether Claude API was used
     * @param clientId : client identifier
     * @return : void
     *******************************/
    
    try {
        const sheets = await createSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        
        const logData = [
            new Date().toISOString(),
            type,
            usedAI ? 'claude-api' : 'template',
            clientId,
            Object.keys(inputs).length,
            JSON.stringify(inputs).length
        ];

        await appendSheetValues(sheets, spreadsheetId, 'AI_Usage!A:F', logData);
    } catch (error) {
        console.warn('Failed to log AI usage:', error.message);
    }
}

/* *******************************
 * Rate Limiting Implementation
 * Prevent abuse of AI generation features
 *******************************/

const generationCounts = new Map();
const MAX_GENERATIONS = 10; // Per hour
const GENERATION_COOLDOWN = 60 * 60 * 1000; // 1 hour

/**
 * Check if client is rate limited for AI generation
 */
async function isRateLimited(clientId) {
    /* *******************************
     * Verify if client has exceeded AI generation limits
     * @param clientId : client identifier (IP address)
     * @return : boolean indicating if rate limited
     *******************************/
    
    const generations = generationCounts.get(clientId);
    
    if (!generations) {
        return false;
    }
    
    // Check if cooldown period has expired
    if (Date.now() - generations.lastGeneration > GENERATION_COOLDOWN) {
        generationCounts.delete(clientId);
        return false;
    }
    
    return generations.count >= MAX_GENERATIONS;
}

/**
 * Record successful generation for rate limiting
 */
async function recordGeneration(clientId) {
    /* *******************************
     * Track generation count for rate limiting
     * @param clientId : client identifier (IP address)
     * @return : void
     *******************************/
    
    const generations = generationCounts.get(clientId) || { count: 0, lastGeneration: 0 };
    
    generations.count += 1;
    generations.lastGeneration = Date.now();
    
    generationCounts.set(clientId, generations);
    
    console.log(`Generation ${generations.count}/${MAX_GENERATIONS} recorded for client: ${clientId}`);
}

// Clean up old generation records periodically
setInterval(() => {
    /* *******************************
     * Cleanup expired rate limiting records
     *******************************/
    
    const now = Date.now();
    for (const [clientId, generations] of generationCounts.entries()) {
        if (now - generations.lastGeneration > GENERATION_COOLDOWN) {
            generationCounts.delete(clientId);
        }
    }
}, 60 * 1000); // Clean up every minute

module.exports = claudeGenerateHandler;