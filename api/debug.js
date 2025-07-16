/* *******************************
 * Debug API Handler for Vercel Serverless Functions
 * Helps verify serverless function compatibility and response object behavior
 * 
 * @author NEST FEST Development Team
 * @version 1.0
 * @date July 2025
 * @note Debug endpoint to test res.status compatibility
 * @note Uses CommonJS modules for consistency with codebase
 * @note Vercel serverless function compatible
 *******************************/

/**
 * Debug handler to test serverless function response compatibility
 */
async function debugHandler(req, res) {
    /* *******************************
     * Test various response patterns to verify Vercel compatibility
     * @param req : request object
     * @param res : response object (Vercel serverless compatible)
     * @return : JSON response with debug information
     *******************************/
    
    // CORS headers for frontend integration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Test response object properties and methods
        const debugInfo = {
            timestamp: new Date().toISOString(),
            method: req.method,
            environment: process.env.NODE_ENV || 'development',
            vercelUrl: process.env.VERCEL_URL || 'Not set',
            responseObjectInfo: {
                hasStatusMethod: typeof res.status === 'function',
                hasJsonMethod: typeof res.json === 'function',
                hasEndMethod: typeof res.end === 'function',
                hasSetHeaderMethod: typeof res.setHeader === 'function',
                responseType: typeof res,
                responseConstructor: res.constructor.name
            },
            requestObjectInfo: {
                hasBody: !!req.body,
                hasHeaders: !!req.headers,
                hasMethod: !!req.method,
                userAgent: req.headers['user-agent'] || 'Not provided',
                clientIp: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'Unknown'
            }
        };

        // Test different response status codes
        if (req.method === 'GET') {
            // Test successful response
            return res.status(200).json({
                success: true,
                message: 'Debug endpoint working correctly',
                debug: debugInfo,
                testResults: {
                    statusMethodWorking: true,
                    jsonMethodWorking: true,
                    vercelCompatible: true
                }
            });
        } else if (req.method === 'POST') {
            // Test POST request handling
            const { testType } = req.body || {};
            
            if (testType === 'error') {
                // Test error response
                return res.status(400).json({
                    success: false,
                    error: 'Test error response',
                    code: 'TEST_ERROR',
                    debug: debugInfo
                });
            } else if (testType === 'server_error') {
                // Test server error response
                return res.status(500).json({
                    success: false,
                    error: 'Test server error',
                    code: 'TEST_SERVER_ERROR',
                    debug: debugInfo
                });
            } else if (testType === 'rate_limit') {
                // Test rate limit response
                return res.status(429).json({
                    success: false,
                    error: 'Test rate limit response',
                    code: 'TEST_RATE_LIMIT',
                    debug: debugInfo
                });
            } else {
                // Test successful POST response
                return res.status(201).json({
                    success: true,
                    message: 'POST request processed successfully',
                    receivedData: req.body,
                    debug: debugInfo
                });
            }
        } else {
            // Test method not allowed response
            return res.status(405).json({
                success: false,
                error: 'Method not allowed',
                code: 'METHOD_NOT_ALLOWED',
                allowedMethods: ['GET', 'POST', 'OPTIONS'],
                debug: debugInfo
            });
        }

    } catch (error) {
        // Test error handling
        console.error('Debug handler error:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Debug handler encountered an error',
            code: 'DEBUG_ERROR',
            errorMessage: error.message,
            errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            debug: {
                timestamp: new Date().toISOString(),
                method: req.method,
                environment: process.env.NODE_ENV || 'development'
            }
        });
    }
}

/**
 * Test Claude API endpoint compatibility
 */
async function testClaudeEndpoint(req, res) {
    /* *******************************
     * Test Claude API endpoint with same patterns as claude-generate.js
     * @param req : request object
     * @param res : response object
     * @return : JSON response testing Claude API patterns
     *******************************/
    
    try {
        // Test the exact patterns used in claude-generate.js
        const { type, inputs } = req.body || {};

        // Validate request structure (same as claude-generate.js)
        if (!type || !inputs) {
            return res.status(400).json({ 
                error: 'Missing required fields: type and inputs',
                code: 'MISSING_FIELDS',
                debug: {
                    receivedType: type,
                    receivedInputs: inputs,
                    bodyExists: !!req.body
                }
            });
        }

        // Validate content type (same as claude-generate.js)
        const validTypes = ['business_description', 'pitch_outline', 'executive_summary', 'presentation_slides'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ 
                error: 'Invalid content type',
                code: 'INVALID_TYPE',
                validTypes,
                receivedType: type
            });
        }

        // Test rate limiting response (same as claude-generate.js)
        if (type === 'test_rate_limit') {
            return res.status(429).json({ 
                error: 'Too many generation requests. Please try again later.',
                code: 'RATE_LIMITED',
                debug: {
                    testPassed: true,
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Test successful response (same as claude-generate.js)
        return res.status(200).json({
            success: true,
            content: `Test content generated for type: ${type}`,
            metadata: {
                type,
                generatedBy: 'debug-template',
                timestamp: new Date().toISOString()
            },
            debug: {
                inputsReceived: inputs,
                endpointWorking: true,
                vercelCompatible: true
            }
        });

    } catch (error) {
        console.error('Claude endpoint test error:', error);
        
        return res.status(500).json({ 
            error: 'Failed to test Claude endpoint. Debug test failed.',
            code: 'CLAUDE_TEST_ERROR',
            debug: {
                errorMessage: error.message,
                timestamp: new Date().toISOString()
            }
        });
    }
}

/**
 * Route handler - determines which test to run
 */
async function debugRouteHandler(req, res) {
    /* *******************************
     * Main debug route handler
     * @param req : request object
     * @param res : response object
     * @return : JSON response from appropriate test
     *******************************/
    
    const { test } = req.query || {};
    
    if (test === 'claude') {
        return await testClaudeEndpoint(req, res);
    } else {
        return await debugHandler(req, res);
    }
}

module.exports = debugRouteHandler;