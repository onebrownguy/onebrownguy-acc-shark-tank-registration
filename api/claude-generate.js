/* *******************************
 * Claude AI Content Generation API Handler
 * Handles AI-powered content generation for NEST FEST quick-builder tool
 * 
 * @author NEST FEST Development Team
 * @version 1.0
 * @date July 2025
 * @note Integrates with Claude API for content generation with fallback templates
 * @note Uses CommonJS modules for consistency with codebase
 * @note Includes rate limiting and security measures
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
        const clientId = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
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
            if (process.env.CLAUDE_API_KEY) {
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
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.CLAUDE_API_KEY,
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
    
    const baseContext = "You are helping a student create professional content for a NEST FEST entrepreneurship pitch presentation. Be encouraging, professional, and focus on practical business value.";

    switch (type) {
        case 'business_description':
            return `${baseContext}

Create a compelling business description based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem being solved: ${inputs.problem || 'Not provided'}
- What they're seeking: ${inputs.needs || 'Not provided'}

Format as a professional business description suitable for a pitch presentation. Keep it concise but impactful (200-300 words).`;

        case 'pitch_outline':
            return `${baseContext}

Create a 5-minute pitch outline based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem: ${inputs.problem || 'Not provided'}
- Target market: ${inputs.market || 'Not provided'}
- Competitive advantage: ${inputs.advantage || 'Not provided'}

Provide a structured outline with timing suggestions for each section.`;

        case 'executive_summary':
            return `${baseContext}

Create an executive summary based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem: ${inputs.problem || 'Not provided'}
- Solution: ${inputs.solution || 'Not provided'}
- Market opportunity: ${inputs.market || 'Not provided'}
- Financial projections: ${inputs.financials || 'Not provided'}

Format as a one-page executive summary suitable for investors.`;

        case 'presentation_slides':
            return `${baseContext}

Create slide content suggestions based on these details:
- Business concept: ${inputs.concept || 'Not provided'}
- Problem: ${inputs.problem || 'Not provided'}
- Solution: ${inputs.solution || 'Not provided'}

Suggest 7-10 slide topics with brief content descriptions for each slide.`;

        default:
            return `${baseContext}\n\nCreate professional business content based on the provided information: ${JSON.stringify(inputs)}`;
    }
}

/**
 * Generate content using template-based fallback
 */
async function generateWithTemplate(type, inputs) {
    /* *******************************
     * Fallback content generation using predefined templates
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
 * Template generators for each content type
 */
function generateBusinessDescriptionTemplate(inputs) {
    return `BUSINESS CONCEPT: ${inputs.concept || '[Your business concept]'}

THE PROBLEM WE'RE SOLVING: ${inputs.problem || '[Problem description]'}

OUR SOLUTION: ${inputs.solution || '[Your solution approach]'}

WHAT WE'RE SEEKING: ${inputs.needs || '[Funding/resources needed]'}

This represents a significant opportunity to make a meaningful impact while building a sustainable and profitable business. Our team is committed to delivering innovative solutions that address real market needs and create value for all stakeholders.

Ready to turn this vision into reality at NEST FEST!`;
}

function generatePitchOutlineTemplate(inputs) {
    return `NEST FEST PITCH OUTLINE (5 minutes)

1. HOOK (30 seconds)
   - Start with the problem: ${inputs.problem || '[Your problem statement]'}
   - Make it relatable and urgent

2. BUSINESS CONCEPT (60 seconds)
   - What we do: ${inputs.concept || '[Your business concept]'}
   - How we're different: ${inputs.advantage || '[Your competitive advantage]'}

3. MARKET OPPORTUNITY (60 seconds)
   - Target market: ${inputs.market || '[Your target market]'}
   - Market size and growth potential

4. SOLUTION DEMO (90 seconds)
   - Show your product/service in action
   - Highlight key benefits and features

5. BUSINESS MODEL (60 seconds)
   - How we make money
   - Revenue streams and projections

6. WHAT WE'RE SEEKING (30 seconds)
   - Funding amount: ${inputs.funding || '[Amount needed]'}
   - Use of funds and timeline
   - Call to action for investors

TIPS: Practice timing, use visuals, tell a story, end with confidence!`;
}

function generateExecutiveSummaryTemplate(inputs) {
    return `EXECUTIVE SUMMARY

COMPANY: ${inputs.businessName || '[Business Name]'}

PROBLEM & OPPORTUNITY
${inputs.problem || '[Problem description and market opportunity]'}

SOLUTION
${inputs.solution || '[Your solution and value proposition]'}

MARKET
${inputs.market || '[Target market and size]'}

COMPETITIVE ADVANTAGE
${inputs.advantage || '[What makes you different]'}

BUSINESS MODEL
${inputs.businessModel || '[How you make money]'}

FINANCIAL PROJECTIONS
${inputs.financials || '[Revenue projections and key metrics]'}

FUNDING REQUEST
${inputs.funding || '[Amount seeking and use of funds]'}

TEAM
${inputs.team || '[Key team members and expertise]'}

This executive summary outlines a compelling business opportunity with strong market potential and a clear path to profitability.`;
}

function generatePresentationSlidesTemplate(inputs) {
    return `NEST FEST PRESENTATION SLIDES

SLIDE 1: TITLE
- Company name: ${inputs.businessName || '[Business Name]'}
- Tagline: ${inputs.tagline || '[Compelling tagline]'}
- Your name and title

SLIDE 2: THE PROBLEM
- ${inputs.problem || '[Problem statement]'}
- Include compelling statistics or examples

SLIDE 3: OUR SOLUTION
- ${inputs.solution || '[Solution overview]'}
- Key benefits and features

SLIDE 4: MARKET OPPORTUNITY
- ${inputs.market || '[Target market description]'}
- Market size and growth trends

SLIDE 5: COMPETITIVE ADVANTAGE
- ${inputs.advantage || '[What makes you different]'}
- Comparison with alternatives

SLIDE 6: BUSINESS MODEL
- Revenue streams
- Pricing strategy

SLIDE 7: FINANCIAL PROJECTIONS
- 3-year revenue forecast
- Key metrics and assumptions

SLIDE 8: FUNDING REQUEST
- Amount seeking: ${inputs.funding || '[Amount]'}
- Use of funds breakdown

SLIDE 9: TEAM
- Key team members
- Relevant experience and expertise

SLIDE 10: CALL TO ACTION
- Next steps
- Contact information
- Thank you

Remember: Keep slides visual, limit text, practice your timing!`;
}

function generateGenericTemplate(inputs) {
    return `PROFESSIONAL BUSINESS CONTENT

Based on your input, here's a structured overview:

CONCEPT: ${inputs.concept || '[Business concept]'}

KEY POINTS:
${Object.entries(inputs).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

This content has been generated to help you create a professional presentation for NEST FEST. Consider expanding on each section with specific details, examples, and data to strengthen your pitch.

Good luck with your presentation!`;
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