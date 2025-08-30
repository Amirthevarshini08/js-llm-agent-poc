document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    // IMPORTANT: Get your free API key from https://aipipe.ai and paste it here.
    const AIPIPE_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImthdXRpa3N0dWR5QGdtYWlsLmNvbSJ9.nWSOYUOdkRUMhg3g4BB17rBf9s-UXD09PiR0UR_mMlQ';

    // --- DOM ELEMENTS ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const alertContainer = document.getElementById('alert-container');

    // --- LLM & AGENT INITIALIZATION ---
    // This will now correctly find the #llm-provider-selector div
    const llmProvider = new LlmProvider(); 
    let messages = [{
        role: 'system',
        content: 'You are a helpful assistant. You have access to a set of tools to answer user questions. When you receive the results of a tool call, use them to formulate your response. If the results are insufficient, you can call another tool. Once you have enough information to answer the user fully, provide the final answer without making any more tool calls.'
    }];

    // --- TOOL DEFINITIONS ---
    const tools = [{
        type: 'function',
        function: {
            name: 'google_search',
            description: 'Get search result snippets from Google for a given query.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query to send to Google.'
                    },
                },
                required: ['query'],
            },
        },
    }, {
        type: 'function',
        function: {
            name: 'aipipe_run',
            description: 'Runs a specific AI Pipe data workflow by its ID.',
            parameters: {
                type: 'object',
                properties: {
                    pipe_id: {
                        type: 'string',
                        description: 'The ID of the AI Pipe to run (e.g., "Pn38L1q").'
                    },
                    input_data: {
                        type: 'object',
                        description: 'The JSON data to send as input to the pipe.',
                        properties: {
                            text: { type: 'string' }
                        },
                        required: ["text"]
                    },
                },
                required: ['pipe_id', 'input_data'],
            },
        },
    }, {
        type: 'function',
        function: {
            name: 'execute_javascript',
            description: 'Executes a snippet of JavaScript code in a sandboxed environment and returns the result. Use this for calculations or simple manipulations. Do not use for DOM access.',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'The JavaScript code to execute. Must be an expression that returns a value.',
                    },
                },
                required: ['code'],
            },
        },
    }, ];

    // --- EVENT LISTENERS ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userMessage = userInput.value.trim();
        if (!userMessage) return;

        messages.push({ role: 'user', content: userMessage });
        addMessageToUI('user', userMessage);
        userInput.value = '';
        toggleInput(false);

        await runConversation();
        toggleInput(true);
    });

    // --- CORE AGENT LOGIC ---
    async function runConversation() {
        addThinkingIndicator();
        try {
            const llm = llmProvider.llm();
            if (!llm) {
                showAlert('Please select an LLM provider and enter your API key.');
                removeThinkingIndicator();
                return;
            }
            const response = await llm.chat.completions.create({
                model: llmProvider.model(),
                messages: messages,
                tools: tools,
                tool_choice: 'auto',
            });
            const responseMessage = response.choices[0].message;
            messages.push(responseMessage);
            if (responseMessage.content) {
                addMessageToUI('assistant', responseMessage.content);
            }
            if (responseMessage.tool_calls) {
                const toolResults = await Promise.all(
                    responseMessage.tool_calls.map(handleToolCall)
                );
                messages.push(...toolResults);
                await runConversation();
            }
        } catch (error) {
            console.error('Error during conversation:', error);
            showAlert(`An error occurred: ${error.message}`);
        } finally {
            removeThinkingIndicator();
        }
    }

    async function handleToolCall(toolCall) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let result = '';
        addMessageToUI('tool', `▶️ Calling ${functionName}(${JSON.stringify(args)})`);
        try {
            switch (functionName) {
                case 'google_search':
                    result = await executeGoogleSearch(args);
                    break;
                case 'aipipe_run':
                    result = await executeAiPipe(args);
                    break;
                case 'execute_javascript':
                    result = await executeJsCode(args);
                    break;
                default:
                    result = `Error: Tool '${functionName}' not found.`;
            }
        } catch (error) {
            result = `Error executing tool: ${error.message}`;
        }
        const resultString = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        addMessageToUI('tool-result', `✅ Result from ${functionName}:\n${resultString}`);
        return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: resultString,
        };
    }

    // --- TOOL IMPLEMENTATIONS ---
    async function executeGoogleSearch(args) {
        if (AIPIPE_API_KEY === 'YOUR_AIPIPE_API_KEY_HERE') {
            throw new Error("AI Pipe API key not configured in agent.js.");
        }
        const response = await fetch('https://aipipe.ai/api/v1/proxy/google_search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AIPIPE_API_KEY}`
            },
            body: JSON.stringify({ query: args.query })
        });
        if (!response.ok) throw new Error(`Google Search API failed with status ${response.status}`);
        const data = await response.json();
        return data.items?.map(item => ({ title: item.title, snippet: item.snippet })).slice(0, 5) || "No results found.";
    }

    async function executeAiPipe(args) {
        if (AIPIPE_API_KEY === 'YOUR_AIPIPE_API_KEY_HERE') {
            throw new Error("AI Pipe API key not configured in agent.js.");
        }
        const response = await fetch(`https://aipipe.ai/api/v1/pipe/${args.pipe_id}/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AIPIPE_API_KEY}`
            },
            body: JSON.stringify(args.input_data)
        });
        if (!response.ok) throw new Error(`AI Pipe API failed with status ${response.status}`);
        return await response.json();
    }

    async function executeJsCode(args) {
        try {
            const result = new Function(`'use strict'; return (${args.code})`)();
            return result;
        } catch (error) {
            return `Error: ${error.message}`;
        }
    }

    // --- UI HELPER FUNCTIONS ---
    function addMessageToUI(role, content) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', role);
        const preElement = document.createElement('pre');
        preElement.textContent = content;
        messageElement.appendChild(preElement);
        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function addThinkingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'thinking-indicator';
        indicator.classList.add('message', 'thinking');
        indicator.textContent = 'Thinking...';
        chatWindow.appendChild(indicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function removeThinkingIndicator() {
        const indicator = document.getElementById('thinking-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    function toggleInput(enabled) {
        userInput.disabled = !enabled;
        chatForm.querySelector('button').disabled = !enabled;
    }

    function showAlert(message, type = 'danger') {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = [
            `<div class="alert alert-${type} alert-dismissible fade show" role="alert">`,
            `   <div>${message}</div>`,
            '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
            '</div>'
        ].join('');
        alertContainer.append(wrapper);
    }
});
