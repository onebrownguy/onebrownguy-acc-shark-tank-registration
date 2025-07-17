/* *******************************
 * AI Presentation Coach - External JavaScript
 * CSP-compliant external script for the AI coaching interface
 * 
 * @author NEST FEST Development Team
 * @version 1.0 - CSP Compliant
 * @date July 2025
 *******************************/

// Global variables
let currentStep = 1;
let studentData = {};
let generatedContent = {};

// Wait for DOMPurify
function waitForDOMPurify() {
    return new Promise((resolve) => {
        if (typeof DOMPurify !== 'undefined') {
            resolve();
        } else {
            setTimeout(() => waitForDOMPurify().then(resolve), 100);
        }
    });
}

// Sanitize input
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(input.trim());
    } else {
        return input.trim()
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '');
    }
}

// Update progress bar
function updateProgress() {
    const progress = (currentStep - 1) / 4 * 100;
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = progress + '%';
    }
}

// Update step indicators
function updateStepIndicators() {
    document.querySelectorAll('.step').forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');
        
        if (stepNum < currentStep) {
            step.classList.add('completed');
        } else if (stepNum === currentStep) {
            step.classList.add('active');
        }
    });
}

// Show specific step
function showStep(stepNumber) {
    document.querySelectorAll('.coaching-step').forEach(step => {
        step.classList.remove('active');
    });
    
    const targetStep = document.getElementById(`step${stepNumber}`);
    if (targetStep) {
        targetStep.classList.add('active');
    }
    
    currentStep = stepNumber;
    updateProgress();
    updateStepIndicators();
    updatePreview();
}

// Update preview panel
function updatePreview() {
    const preview = document.getElementById('contentPreview');
    if (!preview) return;
    
    let content = '';
    
    if (studentData.studentName) {
        content += `<strong>👤 Student:</strong> ${studentData.studentName}<br><br>`;
    }
    
    if (studentData.businessIdea) {
        content += `<strong>💡 Business Idea:</strong><br>${studentData.businessIdea}<br><br>`;
    }
    
    if (studentData.problemDescription) {
        content += `<strong>🎯 Problem:</strong><br>${studentData.problemDescription}<br><br>`;
    }
    
    if (studentData.solutionDescription) {
        content += `<strong>🚀 Solution:</strong><br>${studentData.solutionDescription}<br><br>`;
    }
    
    if (content) {
        preview.innerHTML = content;
    } else {
        preview.innerHTML = '<div class="preview-empty">Your content will appear here as you progress through the steps.</div>';
    }
}

// Validate current step
function validateCurrentStep() {
    const currentStepElement = document.getElementById(`step${currentStep}`);
    if (!currentStepElement) return false;
    
    const requiredInputs = currentStepElement.querySelectorAll('input[required], select[required], textarea[required]');
    
    for (let input of requiredInputs) {
        if (!input.value.trim()) {
            input.focus();
            input.style.borderColor = '#e74c3c';
            return false;
        } else {
            input.style.borderColor = '#e0e0e0';
        }
    }
    
    return true;
}

// Collect data from current step
function collectStepData() {
    if (currentStep === 1) {
        const nameInput = document.getElementById('studentName');
        const emailInput = document.getElementById('studentEmail');
        const majorInput = document.getElementById('studentMajor');
        
        if (nameInput) studentData.studentName = sanitizeInput(nameInput.value);
        if (emailInput) studentData.studentEmail = sanitizeInput(emailInput.value);
        if (majorInput) studentData.studentMajor = majorInput.value;
    } else if (currentStep === 2) {
        const ideaInput = document.getElementById('businessIdea');
        if (ideaInput) studentData.businessIdea = sanitizeInput(ideaInput.value);
    } else if (currentStep === 3) {
        const problemInput = document.getElementById('problemDescription');
        if (problemInput) studentData.problemDescription = sanitizeInput(problemInput.value);
    } else if (currentStep === 4) {
        const solutionInput = document.getElementById('solutionDescription');
        const fundingInput = document.getElementById('fundingNeeds');
        
        if (solutionInput) studentData.solutionDescription = sanitizeInput(solutionInput.value);
        if (fundingInput) studentData.fundingNeeds = sanitizeInput(fundingInput.value);
    }
}

// Generate content with AI
async function generateContent() {
    console.log('=== Starting AI content generation ===');
    console.log('Student data:', studentData);
    
    await waitForDOMPurify();
    
    showStep(5);
    
    try {
        console.log('=== Sending API Request ===');
        console.log('Request data:', {
            type: 'presentation_coaching',
            inputs: studentData
        });
        
        const response = await fetch('/api/claude-generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'presentation_coaching',
                inputs: studentData
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('=== API Response received ===');
        console.log('Response metadata:', data.metadata);
        console.log('Generated by:', data.metadata?.generatedBy);
        console.log('Content type:', typeof data.content);
        console.log('Content keys:', data.content ? Object.keys(data.content) : 'No content');
        
        // Handle different response formats
        if (data.content && typeof data.content === 'string') {
            console.log('Content is string, attempting JSON parse...');
            // Try to parse as JSON (for presentation_coaching type)
            try {
                generatedContent = JSON.parse(data.content);
                console.log('Successfully parsed JSON content');
            } catch (parseError) {
                console.warn('Content is not JSON, using fallback format');
                generatedContent = {
                    elevator: data.content,
                    presentation: data.content,
                    notes: data.content,
                    qa: data.content
                };
            }
        } else if (data.content && typeof data.content === 'object') {
            console.log('Content is already an object');
            generatedContent = data.content;
        } else {
            console.error('Invalid response format from API');
            throw new Error('Invalid response format from API');
        }
        
        // Show completion
        const aiLoading = document.getElementById('aiLoading');
        const generationComplete = document.getElementById('generationComplete');
        
        if (aiLoading) aiLoading.classList.remove('active');
        if (generationComplete) generationComplete.style.display = 'block';
        
        // Populate content sections
        populateContentSections();
        
        // Save to database
        await saveSession();
        
    } catch (error) {
        console.error('=== Error generating content ===', error);
        console.log('Falling back to template generation');
        // Fallback to template generation
        generateFallbackContent();
    }
}

// Fallback content generation
function generateFallbackContent() {
    console.log('=== Generating fallback content ===');
    generatedContent = {
        elevator: generateElevatorPitch(),
        presentation: generatePresentationOutline(),
        notes: generateSpeakerNotes(),
        qa: generateQAPrep()
    };
    
    console.log('Generated fallback content:', generatedContent);
    
    const aiLoading = document.getElementById('aiLoading');
    const generationComplete = document.getElementById('generationComplete');
    
    if (aiLoading) aiLoading.classList.remove('active');
    if (generationComplete) generationComplete.style.display = 'block';
    
    // Populate content sections
    populateContentSections();
    
    saveSession();
}

// Generate elevator pitch
function generateElevatorPitch() {
    const name = studentData.studentName || 'Student';
    const major = studentData.studentMajor || 'Austin Community College';
    const idea = studentData.businessIdea || 'our innovative business concept';
    const problem = studentData.problemDescription || 'a significant market challenge';
    const solution = studentData.solutionDescription || 'our comprehensive solution';
    const funding = studentData.fundingNeeds || 'support and mentorship';
    
    return `Hi, I'm ${name}, a ${major} student with a vision to transform how businesses operate. 

${idea.charAt(0).toUpperCase() + idea.slice(1)}

The problem is clear: ${problem} This affects countless businesses and families in our community, creating real barriers to success and growth.

Our solution is innovative yet practical: ${solution} 

What makes us different is our student-led approach - we're creating entry-level opportunities while delivering professional-grade services. We're seeking ${funding.toLowerCase()} to launch this initiative and start making a measurable impact in our community.

This isn't just a business opportunity - it's a chance to bridge the gap between education and real-world application while solving genuine problems for local businesses and families.`;
}

// Generate presentation outline
function generatePresentationOutline() {
    const name = studentData.studentName || 'Student';
    const major = studentData.studentMajor || 'Austin Community College';
    const idea = studentData.businessIdea || 'our innovative business concept';
    const problem = studentData.problemDescription || 'a significant market challenge';
    const solution = studentData.solutionDescription || 'our comprehensive solution';
    const funding = studentData.fundingNeeds || 'support and mentorship';
    
    return `NEST FEST PRESENTATION OUTLINE - ${name}

🎯 HOOK & INTRODUCTION (30 seconds)
   - "Hi, I'm ${name}, a ${major} student, and I'm here to solve a problem that affects every business owner in this room"
   - "How many of you have struggled with [relate to their specific problem]?"
   - Business concept: ${idea}

🔥 THE PROBLEM (60 seconds)
   - The Challenge: ${problem}
   - Real Impact: "This isn't just an inconvenience - it's costing businesses money and limiting growth"
   - Market Scope: "This affects thousands of local businesses and families"
   - Why Now: "The need for affordable, accessible solutions has never been greater"

💡 OUR SOLUTION (90 seconds)
   - Our Approach: ${solution}
   - Unique Value: "We're student-led, which means fresh perspectives, affordable pricing, and flexible service"
   - Key Benefits:
     * Cost-effective alternative to traditional services
     * Student talent creates entry-level job opportunities
     * Personal attention and customized solutions
     * Community-focused approach
   - Competitive Advantage: "While others focus on big corporate clients, we're building solutions specifically for small businesses and families"

💰 BUSINESS MODEL & TRACTION (45 seconds)
   - Revenue Streams: Service fees, retainer agreements, training programs
   - Target Market: Small businesses, families, startups
   - Scalability: "Once we prove the model locally, we can expand to other college communities"
   - Early Validation: "We've already identified specific pain points through market research"

🚀 WHAT WE'RE SEEKING (60 seconds)
   - Funding Request: ${funding}
   - Specific Use of Funds:
     * 40% - Student wages and training
     * 30% - Technology and infrastructure
     * 20% - Marketing and business development
     * 10% - Operations and administration
   - Milestones: "In 3 months, we'll have served 20+ clients and hired 5 students"
   - ROI: "This investment creates jobs, serves community needs, and builds a sustainable business"

🎪 CLOSING & CALL TO ACTION (30 seconds)
   - Vision: "We're not just building a business - we're creating opportunities and solving real problems"
   - Ask: "Join us in bridging the gap between education and community needs"
   - Next Steps: "Let's discuss how you can be part of this solution"
   - Contact: "${name} - [Your Contact Information]"
   - "Thank you for believing in student entrepreneurs!"

DELIVERY TIPS:
• Make eye contact with different audience members
• Use hand gestures to emphasize key points
• Pause after important statements for impact
• Show genuine passion for solving the problem
• Practice timing - aim for 4.5 minutes to allow for Q&A buffer`;
}

// Generate speaker notes
function generateSpeakerNotes() {
    const name = studentData.studentName || 'Student';
    const problem = studentData.problemDescription || 'the challenge you\'re solving';
    const solution = studentData.solutionDescription || 'your solution';
    
    return `SPEAKER CONFIDENCE NOTES FOR ${name}

🌟 PRE-PRESENTATION POWER-UP:
- Take 5 deep breaths and visualize success
- Remember: You're not just pitching - you're sharing a vision that can change lives
- Every person in that room wants to see students succeed
- Your idea has genuine value - that's why you're here

💪 CONFIDENCE BUILDERS - USE THESE PHRASES:
- "As a student entrepreneur, I bring a fresh perspective..."
- "Through my research and experience, I've discovered..."
- "The community feedback has been overwhelmingly positive..."
- "This isn't just theory - I've seen this problem firsthand..."
- "We're uniquely positioned because..."

🎯 KEY TALKING POINTS TO EMPHASIZE:
- Student-Led Advantage: "Our student perspective gives us unique insights into affordability and accessibility"
- Community Impact: "${problem.charAt(0).toUpperCase() + problem.slice(1)} - this affects real families and businesses in our community"
- Practical Solution: "${solution.charAt(0).toUpperCase() + solution.slice(1)} - we're offering something tangible and immediate"
- Economic Benefits: "We're creating jobs while solving problems - a win-win for everyone"
- Scalability: "What starts here can expand to help other communities"

🚀 ENERGY & DELIVERY:
- Start Strong: Open with conviction, not apology
- Show Passion: Let your excitement about the solution shine through
- Use Numbers: "$10K over 3 months creates 5 jobs and serves 20+ clients"
- Paint the Picture: Help judges envision the impact
- End with Power: "This is our opportunity to prove that student entrepreneurs can drive real change"

💬 BODY LANGUAGE & PRESENCE:
- Stand tall with shoulders back (you belong here!)
- Make eye contact with each judge individually
- Use open hand gestures (avoid pointing or closed fists)
- Move purposefully - 2-3 steps to emphasize transitions
- Smile when talking about impact and vision

🆘 NERVOUS MOMENT RESCUE PLAN:
- If you lose your place: "Let me emphasize the most important point..."
- If you stumble: Pause, smile, continue (don't apologize!)
- If you blank out: "The core message is simple: [state your main benefit]"
- If time runs short: Jump to your ask and close strong
- Remember: Nerves show you care - that's attractive to investors

🔥 POWER PHRASES TO MEMORIZE:
- "This is bigger than just a business - it's about opportunity"
- "We're not just asking for funding - we're offering a partnership in community impact"
- "In 3 months, you'll see measurable results in both job creation and customer satisfaction"
- "This model proves that students can be both learners and leaders"

⚡ FINAL MINDSET:
You're not just a student asking for money. You're an entrepreneur presenting a solution that creates jobs, serves community needs, and demonstrates the power of student innovation. Walk in there knowing you belong and your idea matters.

REMEMBER: Even if they say no, you've planted a seed. Every pitch makes you stronger and your idea clearer.`;
}

// Generate Q&A prep
function generateQAPrep() {
    const name = studentData.studentName || 'Student';
    const funding = studentData.fundingNeeds || '$10,000 over 3 months';
    const idea = studentData.businessIdea || 'our MSP service model';
    
    return `Q&A PREPARATION GUIDE FOR ${name}

🔥 MOST LIKELY QUESTIONS & WINNING ANSWERS:

Q: "How do you plan to make money?"
A: "Great question! We have multiple revenue streams: service fees for MSP work, retainer agreements for ongoing support, and training programs. Our student-led model allows us to offer competitive pricing while maintaining healthy margins. We're targeting $5K monthly revenue by month 3."

Q: "What's your biggest challenge?"
A: "Honestly, our biggest challenge is also our biggest opportunity - proving that students can deliver professional-grade services. We're addressing this through comprehensive training, mentorship partnerships, and starting with smaller projects to build our track record."

Q: "Who are your competitors?"
A: "Traditional MSPs charge $150-200/hour and target large businesses. We're different - we serve small businesses and families at $50-75/hour with personalized attention. Our real competition isn't other MSPs, it's the 'do nothing' option because current solutions are too expensive."

Q: "How much funding do you need and why?"
A: "We're seeking ${funding}. This breaks down to: 40% for student wages, 30% for technology and tools, 20% for marketing, and 10% for operations. This gets us to profitability within 3 months while creating 5 student jobs."

Q: "What's your timeline?"
A: "Month 1: Hire and train 3 students, secure first 5 clients. Month 2: Scale to 10 clients, refine processes. Month 3: 20+ clients, 5 students employed, cash flow positive. Month 6: Expand services and consider additional locations."

Q: "How do you ensure quality with student workers?"
A: "Excellent question! We have a structured training program, paired mentorship with experienced professionals, and quality assurance protocols. Plus, students bring fresh energy and aren't set in outdated practices."

Q: "What if students graduate or leave?"
A: "That's actually part of our model's strength! We create a pipeline of trained students, document all processes, and view graduation as success - our alumni become referral sources and potential franchise partners."

Q: "How is this scalable?"
A: "Every college town has the same opportunity - students needing work experience and small businesses needing affordable tech support. Once we prove the model here, we can license it to other ACC campuses and community colleges nationwide."

🎯 ADVANCED QUESTIONS (SHOW YOU'VE THOUGHT DEEPLY):

Q: "What are your unit economics?"
A: "Average client pays $300/month, our cost is $180 (student wages + overhead), giving us $120 gross profit per client. With 20 clients, that's $2,400 monthly gross profit on $6,000 revenue."

Q: "How do you protect against price competition?"
A: "Our differentiation isn't just price - it's personalized service, community connection, and student energy. Large MSPs can't match our local focus and flexibility. Small competitors can't match our training systems and backing."

Q: "What's your exit strategy?"
A: "Multiple paths: Franchise the model nationally, acquisition by a larger MSP wanting our methodology, or organic growth into a regional player. The model creates value whether we scale or sell."

💪 ANSWER LIKE A PRO - FORMULA:
1. Thank them: "Great question!"
2. Answer directly: Don't dodge
3. Add value: Show you've thought beyond the obvious
4. Bridge back: "This is exactly why our model works..."

🚨 TOUGH QUESTION RESCUE PHRASES:
- "I'm glad you asked that because..."
- "That's exactly what we discovered in our research..."
- "Great point - here's how we're addressing that..."
- "I appreciate that challenge because it shows you're thinking like an investor..."

❓ QUESTIONS TO ASK THEM (TURN THE TABLES):
- "What's the biggest mistake you see student entrepreneurs make?"
- "If you were starting this business, what would you do differently?"
- "What metrics would you want to see at our 3-month check-in?"
- "How can we best leverage your expertise as we grow?"

🏆 CLOSING STRONG:
End every answer with confidence: "This is exactly the kind of challenge that excites us because it validates the market need we're addressing."

REMEMBER: They're not trying to trip you up - they want to see how you think under pressure and whether you've really thought through your business model.`;
}

// Populate content sections
function populateContentSections() {
    console.log('Populating content sections...');
    
    // Populate each content section
    const contentTypes = ['elevator', 'presentation', 'notes', 'qa'];
    contentTypes.forEach(type => {
        const element = document.getElementById(`content-${type}`);
        if (element && generatedContent[type]) {
            element.textContent = generatedContent[type];
        }
    });
    
    // Show the elevator pitch by default
    showContentTab('elevator');
}

// Show specific content tab
function showContentTab(type) {
    console.log('Showing content tab:', type);
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`.tab-btn[data-type="${type}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Update content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    
    const activeSection = document.getElementById(`content-${type}`);
    if (activeSection) {
        activeSection.style.display = 'block';
    }
}

// Save session to database
async function saveSession() {
    try {
        const sessionData = {
            ...studentData,
            generatedContent,
            timestamp: new Date().toISOString(),
            aiGenerated: true
        };

        console.log('Saving session and sending confirmation email...');
        
        const response = await fetch('/api/ai-coaching', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sessionData)
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Session saved successfully:', result);
            showEmailConfirmation(result.sessionId);
        } else {
            console.error('Failed to save session:', await response.text());
        }
    } catch (error) {
        console.error('Error saving session:', error);
    }
}

// Show email confirmation message
function showEmailConfirmation(sessionId) {
    const studentName = studentData.studentName || 'Student';
    const studentEmail = studentData.studentEmail || 'your email';
    
    // Create confirmation message
    const confirmationMessage = document.createElement('div');
    confirmationMessage.className = 'email-confirmation-message';
    confirmationMessage.innerHTML = `
        <div class="confirmation-content">
            <h3>Confirmation Email Sent!</h3>
            <p>Hi ${studentName}! We've sent a confirmation email to <strong>${studentEmail}</strong> with your personalized coaching materials.</p>
            <p><strong>Session ID:</strong> ${sessionId}</p>
            <p>The email includes all four coaching materials and next steps for your presentation preparation.</p>
            <p><em>If you don't see the email in your inbox, please check your spam folder.</em></p>
        </div>
    `;
    
    // Add styles for the confirmation message
    const style = document.createElement('style');
    style.textContent = `
        .email-confirmation-message {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #d4edda;
            border: 2px solid #c3e6cb;
            color: #155724;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            z-index: 1000;
            max-width: 400px;
            animation: slideIn 0.5s ease-out;
        }
        
        .confirmation-content h3 {
            margin: 0 0 10px 0;
            color: #155724;
        }
        
        .confirmation-content p {
            margin: 8px 0;
            line-height: 1.4;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @media (max-width: 768px) {
            .email-confirmation-message {
                position: fixed;
                top: 10px;
                left: 10px;
                right: 10px;
                max-width: none;
            }
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(confirmationMessage);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (confirmationMessage && confirmationMessage.parentNode) {
            confirmationMessage.parentNode.removeChild(confirmationMessage);
        }
    }, 8000);
}

// Download content
function downloadContent(type) {
    console.log('Download requested for type:', type);
    console.log('Generated content:', generatedContent);
    console.log('Available content for type:', generatedContent[type]);
    
    const content = generatedContent[type] || 'Content not available';
    const safeName = (studentData.studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeName}_${type}_${Date.now()}.txt`;
    
    console.log('Downloading filename:', filename);
    console.log('Content length:', content.length);
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Restart process
function restart() {
    currentStep = 1;
    studentData = {};
    generatedContent = {};
    
    // Reset form
    document.querySelectorAll('input, select, textarea').forEach(input => {
        input.value = '';
        input.style.borderColor = '#e0e0e0';
    });
    
    showStep(1);
}

// Event delegation for all interactions
function handleClick(e) {
    const action = e.target.dataset.action;
    const target = e.target.dataset.target;
    
    if (action === 'next-step' && target) {
        if (validateCurrentStep()) {
            collectStepData();
            showStep(parseInt(target));
        }
    } else if (action === 'prev-step' && target) {
        collectStepData();
        showStep(parseInt(target));
    } else if (action === 'generate-content') {
        if (validateCurrentStep()) {
            collectStepData();
            generateContent();
        }
    } else if (action === 'download') {
        const type = e.target.dataset.type;
        downloadContent(type);
    } else if (action === 'show-content') {
        const type = e.target.dataset.type;
        showContentTab(type);
    } else if (action === 'restart') {
        restart();
    }
}

// Initialize when DOM is ready
function initialize() {
    // Add event listener for clicks
    document.addEventListener('click', handleClick);
    
    // Initialize progress and step indicators
    updateProgress();
    updateStepIndicators();
    
    console.log('AI Presentation Coach initialized');
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}