document.addEventListener('DOMContentLoaded', () => {
    // --- UI Element References ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const alertContainer = document.getElementById('alert-container');

    // --- State Management ---
    let messages = []; // Stores the entire conversation history

    const llmProvider = new LlmProvider({
        container: '#llm-provider-container',
        // ⚠️ SECURITY WARNING: This key was exposed publicly.
        // It is critical that you DELETE this key from your OpenAI account
        // and create a NEW one to replace the one below.
        keys: {
           openai: "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"
        }
    });

    // --- Tool Definitions (OpenAI Format) ---
    // This is how we tell the LLM what functions it can call.
    const tools = [{
        type: 'function',
        function: {
            name: 'google_search',
            description: 'Get snippet results from a Google search.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query to send to Google.',
                    },
                },
                required: ['query'],
            },
        },
    }, {
        type: 'function',
        function: {
            name: 'ai_pipe',
            description: 'Call a generic API endpoint (proxy) for complex data flows.',
            parameters: {
                type: 'object',
                properties: {
                    endpoint: {
                        type: 'string',
                        description: 'The specific API endpoint to hit (e.g., "summarize", "translate").',
                    },
                    data: {
                        type: 'object',
                        description: 'The JSON data to send to the endpoint.',
                    },
                },
                required: ['endpoint', 'data'],
            },
        },
    }, {
        type: 'function',
        function: {
            name: 'execute_javascript',
            description: 'Execute sandboxed JavaScript code. Can only return strings or numbers.',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'The JavaScript code to execute.',
                    },
                },
                required: ['code'],
            },
        },
    }];

    // --- Main Agent Logic ---

    // Handle form submission
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userMessage = userInput.value.trim();
        if (!userMessage) return;

        addMessage('user', userMessage);
        messages.push({ role: 'user', content: userMessage });
        userInput.value = '';
        toggleInput(false); // Disable input while agent is working
        runAgentTurn();
    });

    /**
     * This is the core reasoning loop, translated to async JS.
     * It calls the LLM, handles the response, and if tools are called,
     * it executes them and calls itself again with the results.
     */
    async function runAgentTurn() {
        try {
            const response = await llmProvider.chat.completions.create({
                model: llmProvider.model, // Get selected model from the UI
                messages: messages,
                tools: tools,
                tool_choice: 'auto',
            });

            const responseMessage = response.choices[0].message;
            messages.push(responseMessage); // Add LLM's raw response to history

            // If the LLM wants to call tools...
            if (responseMessage.tool_calls) {
                addMessage('tool', 'Agent is using tools...');
                // Execute all tool calls in parallel
                const toolPromises = responseMessage.tool_calls.map(handleToolCall);
                const toolResults = await Promise.all(toolPromises);

                // Add tool results to message history
                for (const toolResult of toolResults) {
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolResult.tool_call_id,
                        content: toolResult.content,
                    });
                }
                // --- THIS IS THE LOOP ---
                // Run the agent again with the new tool results in context
                runAgentTurn(); 
            } else {
                // If no tools, the turn is over. Display the message and wait for user.
                addMessage('agent', responseMessage.content);
                toggleInput(true); // Re-enable input
            }
        } catch (error) {
            console.error("Error during agent turn:", error);
            bootstrapAlert(alertContainer, `API Error: ${error.message}`, 'danger');
            toggleInput(true); // Re-enable input on error
        }
    }


    // --- Tool Implementation ---

    /**
     * Routes a tool call from the LLM to the correct function.
     * @param {object} toolCall - The tool_call object from the LLM response.
     * @returns {Promise<object>} A promise that resolves to the tool result object.
     */
    async function handleToolCall(toolCall) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let content = '';

        addMessage('tool', `Calling tool: ${functionName}(${JSON.stringify(args)})`);

        try {
            switch (functionName) {
                case 'google_search':
                    content = await google_search(args.query);
                    break;
                case 'ai_pipe':
                    content = await ai_pipe(args.endpoint, args.data);
                    break;
                case 'execute_javascript':
                    content = execute_javascript(args.code);
                    break;
                default:
                    content = `Error: Unknown tool '${functionName}'`;
            }
        } catch (error) {
            content = `Error executing tool ${functionName}: ${error.message}`;
        }
        
        // Return in the format expected by the OpenAI API
        return {
            tool_call_id: toolCall.id,
            content: content,
        };
    }
    
    // Tool 1: Google Search (Simulated)
    async function google_search(query) {
        // FOR A REAL APP: You would use a server-side proxy to call the Google Search API
        // with your secret API key. Never expose API keys on the client-side.
        // This is a placeholder for the POC.
        console.log(`Searching for: ${query}`);
        // Example simulated response
        if (query.toLowerCase().includes('ibm')) {
            return "International Business Machines Corporation (IBM) is an American multinational technology corporation headquartered in Armonk, New York. It was founded in 1911.";
        }
        return `No results found for "${query}". This is a simulated search.`;
    }

    // Tool 2: AI Pipe (Simulated)
    async function ai_pipe(endpoint, data) {
        // FOR A REAL APP: This would make a fetch() call to your AI Pipe proxy backend.
        console.log(`Calling AI Pipe endpoint: ${endpoint} with data:`, data);
        return `Successfully called endpoint '${endpoint}'. This is a simulated API response.`;
    }

    // Tool 3: JavaScript Execution (Sandboxed)
    function execute_javascript(code) {
        // WARNING: Executing arbitrary code is dangerous.
        // The Function constructor is slightly safer than eval(), but for a real
        // app, use a proper sandbox like a sandboxed iframe with postMessage.
        try {
            // We wrap the user's code in an IIFE to prevent it from leaking to the global scope
            const result = (new Function(`"use strict"; return (() => { ${code} })();`))();
            // Ensure the result is serializable (can be turned into a string)
            return JSON.stringify(result) || String(result);
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }


    // --- UI Helper Functions ---
    function addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.textContent = content;
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll to bottom
    }

    function toggleInput(enabled) {
        userInput.disabled = !enabled;
        sendButton.disabled = !enabled;
        sendButton.innerHTML = enabled ? 'Send' : '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    }
});
