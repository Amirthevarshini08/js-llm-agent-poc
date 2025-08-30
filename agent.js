document.addEventListener('DOMContentLoaded', () => {
    // --- UI Element References ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const alertContainer = document.getElementById('alert-container');

    // --- State Management ---
    let messages = []; // Stores the entire conversation history

    // CORRECT SETUP: The keys are managed by the UI, not hardcoded.
    const llmProvider = new LlmProvider({
        container: '#llm-provider-container'
    });

    // --- Tool Definitions (OpenAI Format) ---
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
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userMessage = userInput.value.trim();
        if (!userMessage) return;

        addMessage('user', userMessage);
        messages.push({ role: 'user', content: userMessage });
        userInput.value = '';
        toggleInput(false);
        runAgentTurn();
    });

    async function runAgentTurn() {
        try {
            const response = await llmProvider.chat.completions.create({
                model: llmProvider.model,
                messages: messages,
                tools: tools,
                tool_choice: 'auto',
            });

            const responseMessage = response.choices[0].message;
            messages.push(responseMessage);

            if (responseMessage.tool_calls) {
                addMessage('tool', 'Agent is using tools...');
                const toolPromises = responseMessage.tool_calls.map(handleToolCall);
                const toolResults = await Promise.all(toolPromises);

                for (const toolResult of toolResults) {
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolResult.tool_call_id,
                        content: toolResult.content,
                    });
                }
                runAgentTurn(); 
            } else {
                addMessage('agent', responseMessage.content);
                toggleInput(true);
            }
        } catch (error) {
            console.error("Error during agent turn:", error);
            bootstrapAlert(alertContainer, `API Error: ${error.message}`, 'danger');
            toggleInput(true);
        }
    }

    // --- Tool Implementation ---
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
        
        return {
            tool_call_id: toolCall.id,
            content: content,
        };
    }
    
    async function google_search(query) {
        console.log(`Searching for: ${query}`);
        if (query.toLowerCase().includes('ibm')) {
            return "International Business Machines Corporation (IBM) is an American multinational technology corporation headquartered in Armonk, New York. It was founded in 1911.";
        }
        return `No results found for "${query}". This is a simulated search.`;
    }

    async function ai_pipe(endpoint, data) {
        console.log(`Calling AI Pipe endpoint: ${endpoint} with data:`, data);
        return `Successfully called endpoint '${endpoint}'. This is a simulated API response.`;
    }

    function execute_javascript(code) {
        try {
            const result = (new Function(`"use strict"; return (() => { ${code} })();`))();
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
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function toggleInput(enabled) {
        userInput.disabled = !enabled;
        sendButton.disabled = !enabled;
        sendButton.innerHTML = enabled ? 'Send' : '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    }
});
