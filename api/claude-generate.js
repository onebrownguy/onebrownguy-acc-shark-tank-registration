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
    // Intelligent template generation with contextual analysis
    const concept = sanitizeAndEnhanceInput(inputs.concept, 'business concept');
    const problem = sanitizeAndEnhanceInput(inputs.problem, 'problem statement');
    const needs = sanitizeAndEnhanceInput(inputs.needs, 'funding/resource needs');
    
    // Generate intelligent solution based on concept analysis
    const solution = generateIntelligentSolution(concept, problem);
    const marketAnalysis = generateMarketAnalysis(concept, problem);
    const competitiveAdvantage = generateCompetitiveAdvantage(concept);
    const revenueModel = generateRevenueModel(concept);
    
    return `BUSINESS CONCEPT
${concept}

${generateContextualIntro(concept, problem)}

THE PROBLEM WE'RE SOLVING
${problem}

${generateProblemAnalysis(problem)}

OUR SOLUTION
${solution}

${generateSolutionDetails(concept, problem)}

MARKET OPPORTUNITY
${marketAnalysis}

COMPETITIVE ADVANTAGE
${competitiveAdvantage}

WHAT WE'RE SEEKING
${needs}

${generateFundingStrategy(needs, concept)}

REVENUE MODEL
${revenueModel}

NEXT STEPS
${generateActionPlan(concept, problem)}

${generateClosingStatement(concept)}

Ready to turn this vision into reality at NEST FEST!`;
}

// Enhanced intelligent template generation helper functions
function sanitizeAndEnhanceInput(input, inputType) {
    if (!input || input.trim().length === 0 || input.toLowerCase().includes('test')) {
        return generatePlaceholderContent(inputType);
    }
    return input.trim();
}

function generatePlaceholderContent(inputType) {
    const placeholders = {
        'business concept': 'innovative digital platform that connects students with local businesses for real-world learning opportunities',
        'problem statement': 'students struggle to gain practical experience while businesses need fresh perspectives and affordable help',
        'funding/resource needs': 'seed funding to develop the platform, hire developers, and launch marketing campaigns'
    };
    return placeholders[inputType] || `comprehensive ${inputType} that addresses market needs`;
}

function generateIntelligentSolution(concept, problem) {
    // Parse the concept to understand what they're actually building
    const conceptLower = concept.toLowerCase();
    const businessType = identifyBusinessType(conceptLower);
    const keyWords = extractKeyWords(conceptLower);
    
    // Generate a solution that specifically addresses their concept and problem
    if (businessType === 'management_platform') {
        return `We provide comprehensive ${keyWords.join(' and ')} management solutions specifically designed for ${extractTargetMarket(conceptLower)}. Our platform addresses ${problem} by offering an integrated suite of tools that streamline operations, reduce costs, and improve efficiency. Unlike expensive enterprise solutions, we focus on affordability and ease of use without sacrificing functionality.`;
    } else if (businessType === 'digital_services') {
        return `Our digital services platform specializes in ${keyWords.join(', ')} for ${extractTargetMarket(conceptLower)}. We solve ${problem} by providing accessible, professional-grade tools and services that were previously only available to large corporations. Our approach combines automation, expert guidance, and cost-effective pricing to deliver enterprise-level results.`;
    } else if (businessType === 'software_platform') {
        return `We've developed a software platform that specifically targets ${problem} through ${keyWords.join(' and ')} capabilities. Our solution provides ${extractTargetMarket(conceptLower)} with the tools they need to compete effectively while maintaining affordability and simplicity.`;
    } else if (businessType === 'consulting_service') {
        return `We offer specialized consulting services focused on ${keyWords.join(', ')} for ${extractTargetMarket(conceptLower)}. Our approach to ${problem} involves hands-on guidance, practical implementation, and ongoing support to ensure sustainable results.`;
    } else {
        return `Our business model centers on ${keyWords.join(', ')} solutions that directly address ${problem}. We've identified that ${extractTargetMarket(conceptLower)} need accessible, cost-effective alternatives to current market offerings, and our approach delivers exactly that.`;
    }
}

function generateContextualIntro(concept, problem) {
    return `Our innovative venture represents a strategic response to a significant market opportunity. By combining cutting-edge technology with deep understanding of customer needs, we are positioned to deliver exceptional value and capture meaningful market share.`;
}

function generateProblemAnalysis(problem) {
    return `This challenge affects thousands of potential customers and represents a substantial market opportunity. Current solutions are either inadequate, too expensive, or simply don't exist, creating a clear opening for our innovative approach. The pain points are real, measurable, and represent significant cost savings and efficiency gains for our target market.`;
}

function generateSolutionDetails(concept, problem) {
    return `Our approach combines proven business principles with innovative execution to deliver measurable results. We focus on user experience, scalability, and sustainable value creation. By addressing the root causes rather than just symptoms, we create lasting solutions that customers will value and recommend.`;
}

function generateMarketAnalysis(concept, problem) {
    const conceptLower = concept.toLowerCase();
    
    if (conceptLower.includes('student') || conceptLower.includes('education')) {
        return `Our primary target market consists of students, educational institutions, and businesses seeking to connect with student talent. This represents a multi-billion dollar opportunity with strong growth potential, driven by increasing demand for practical learning experiences and affordable, skilled assistance.`;
    } else if (conceptLower.includes('small business') || conceptLower.includes('entrepreneur')) {
        return `We target small and medium-sized businesses, entrepreneurs, and startups who need cost-effective solutions to grow their operations. This market segment is underserved by current offerings and represents significant opportunity for scalable growth.`;
    } else {
        return `Our target market consists of individuals and businesses who currently struggle with this problem. Based on market research and industry trends, this represents a substantial opportunity with strong growth potential and clear demand for innovative solutions.`;
    }
}

function generateCompetitiveAdvantage(concept) {
    const conceptLower = concept.toLowerCase();
    
    const advantages = [
        '- Innovative technology approach with user-centered design',
        '- Cost-effective pricing model that delivers superior value',
        '- Scalable business model with strong unit economics',
        '- Deep market understanding and customer relationships',
        '- Experienced team with relevant expertise and proven track record'
    ];
    
    if (conceptLower.includes('ai') || conceptLower.includes('machine learning')) {
        advantages.push('- Advanced AI and machine learning capabilities');
    }
    
    if (conceptLower.includes('mobile') || conceptLower.includes('app')) {
        advantages.push('- Mobile-first design optimized for modern user behavior');
    }
    
    return advantages.join('\n');
}

function generateRevenueModel(concept) {
    const conceptLower = concept.toLowerCase();
    
    if (conceptLower.includes('platform') || conceptLower.includes('marketplace')) {
        return `We plan to generate revenue through multiple streams:
- Transaction fees from platform usage
- Subscription-based premium features
- Partnership agreements with strategic partners
- Commission from successful connections and transactions`;
    } else if (conceptLower.includes('app') || conceptLower.includes('software')) {
        return `Our revenue model includes:
- Freemium model with premium paid features
- Monthly and annual subscription tiers
- In-app purchases and premium content
- B2B licensing for enterprise customers`;
    } else if (conceptLower.includes('service')) {
        return `We generate revenue through:
- Direct service fees charged to clients
- Retainer agreements for ongoing support
- Performance-based pricing for results
- Training and consultation services`;
    } else {
        return `Our diversified revenue model includes:
- Direct sales to end customers
- Subscription-based recurring revenue
- Partnership agreements and licensing
- Premium services and support offerings`;
    }
}

function generateFundingStrategy(needs, concept) {
    return `With the right funding and strategic support, we plan to:
- Accelerate product development and market validation
- Build a world-class team of developers and market experts
- Launch comprehensive marketing and customer acquisition campaigns
- Establish strategic partnerships that enhance our market position
- Scale operations efficiently to capture significant market share`;
}

function generateActionPlan(concept, problem) {
    return `Our immediate priorities include:
- Complete minimum viable product development and testing
- Launch pilot program with select customers for validation
- Gather comprehensive customer feedback and iterate rapidly
- Refine business model based on real market data
- Scale operations systematically to ensure sustainable growth
- Build strategic partnerships that accelerate market penetration`;
}

function generateClosingStatement(concept) {
    return `This represents a significant opportunity to make a meaningful impact while building a sustainable and profitable business. Our team is committed to delivering innovative solutions that address real market needs, create exceptional value for customers, and generate strong returns for investors.`;
}

// Intelligent text analysis helper functions
function identifyBusinessType(conceptLower) {
    if (conceptLower.includes('manager') || conceptLower.includes('management')) {
        return 'management_platform';
    } else if (conceptLower.includes('digital') && (conceptLower.includes('service') || conceptLower.includes('tool'))) {
        return 'digital_services';
    } else if (conceptLower.includes('platform') || conceptLower.includes('software') || conceptLower.includes('app')) {
        return 'software_platform';
    } else if (conceptLower.includes('consulting') || conceptLower.includes('advisor')) {
        return 'consulting_service';
    } else {
        return 'general_business';
    }
}

function extractKeyWords(conceptLower) {
    const keywords = [];
    
    // Technical capabilities
    if (conceptLower.includes('endpoint') || conceptLower.includes('device')) keywords.push('device management');
    if (conceptLower.includes('marketing')) keywords.push('marketing automation');
    if (conceptLower.includes('online') || conceptLower.includes('digital')) keywords.push('digital solutions');
    if (conceptLower.includes('tool')) keywords.push('business tools');
    if (conceptLower.includes('management') || conceptLower.includes('manager')) keywords.push('management systems');
    if (conceptLower.includes('security')) keywords.push('security solutions');
    if (conceptLower.includes('analytics')) keywords.push('data analytics');
    if (conceptLower.includes('automation')) keywords.push('process automation');
    
    // Default to generic terms if no specific keywords found
    if (keywords.length === 0) {
        keywords.push('business solutions', 'operational efficiency');
    }
    
    return keywords;
}

function extractTargetMarket(conceptLower) {
    if (conceptLower.includes('small business')) return 'small businesses';
    if (conceptLower.includes('enterprise')) return 'enterprise clients';
    if (conceptLower.includes('startup')) return 'startups';
    if (conceptLower.includes('home')) return 'home-based businesses';
    if (conceptLower.includes('restaurant')) return 'restaurants';
    if (conceptLower.includes('retail')) return 'retail businesses';
    if (conceptLower.includes('healthcare')) return 'healthcare providers';
    if (conceptLower.includes('education')) return 'educational institutions';
    
    // Default based on context
    return 'small and medium businesses';
}

function generateContextualIntro(concept, problem) {
    const businessType = identifyBusinessType(concept.toLowerCase());
    const targetMarket = extractTargetMarket(concept.toLowerCase());
    
    if (businessType === 'management_platform') {
        return `The ${targetMarket} management landscape is fragmented and expensive, creating a significant opportunity for innovative solutions. Our comprehensive platform addresses these challenges by providing enterprise-grade capabilities at accessible price points.`;
    } else if (businessType === 'digital_services') {
        return `${targetMarket.charAt(0).toUpperCase() + targetMarket.slice(1)} face increasing pressure to digitize operations while managing costs. Our integrated service platform bridges this gap by making professional digital tools accessible and affordable.`;
    } else {
        return `Market research reveals that ${targetMarket} struggle with complex, expensive solutions that don't meet their specific needs. Our approach focuses on delivering exactly what they need at a price they can afford.`;
    }
}

function generateProblemAnalysis(problem) {
    // Analyze the problem to provide specific context
    const problemLower = problem.toLowerCase();
    
    if (problemLower.includes('affordable') || problemLower.includes('cost') || problemLower.includes('expensive')) {
        return `Cost barriers prevent many businesses from accessing the tools they need to grow. Current solutions are priced for large enterprises, leaving smaller businesses underserved. This represents a massive market opportunity for affordable, effective alternatives that deliver real value without breaking the budget.`;
    } else if (problemLower.includes('complex') || problemLower.includes('difficult') || problemLower.includes('complicated')) {
        return `Existing solutions are unnecessarily complex, requiring extensive training and IT support. This complexity barrier prevents adoption and reduces productivity. Our approach simplifies these processes while maintaining professional-grade functionality.`;
    } else if (problemLower.includes('access') || problemLower.includes('available')) {
        return `Many businesses lack access to professional-grade tools and services, limiting their growth potential. This access gap creates competitive disadvantages and missed opportunities. Our solution democratizes access to these essential business capabilities.`;
    } else {
        return `This challenge affects thousands of potential customers and represents a substantial market opportunity. Current solutions fail to address the specific needs of our target market, creating clear demand for our innovative approach.`;
    }
}

function generateRevenueModel(concept) {
    const conceptLower = concept.toLowerCase();
    const businessType = identifyBusinessType(conceptLower);
    
    if (businessType === 'management_platform') {
        return `Our revenue model leverages multiple streams:
- Monthly subscription tiers based on business size and feature needs
- Setup and onboarding services for new clients
- Premium support and consulting services
- Integration services for existing business systems
- Training and certification programs`;
    } else if (businessType === 'digital_services') {
        return `We generate revenue through:
- Service-based fees for marketing, management, and technical services
- Monthly retainer agreements for ongoing support
- Project-based pricing for specific implementations
- Commission-based revenue sharing for successful outcomes
- White-label licensing to other service providers`;
    } else {
        return `Our diversified revenue approach includes:
- Core subscription services with tiered pricing
- Professional services and implementation support
- Partner program commissions and referral fees
- Premium features and add-on services
- Training and educational content`;
    }
}

// Legacy helper function for backward compatibility
function generateSolutionFromConcept(concept, problem) {
    return generateIntelligentSolution(concept, problem);
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