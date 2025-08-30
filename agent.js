document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const alertContainer = document.getElementById('alert-container');

    let messages = [];

    const llmProvider = new LlmProvider({
        container: '#llm-provider-container'
    });

    const tools = [{
        type: 'function',
        function: {
            name: 'google_search',
            description: 'Get snippet results from a Google search.',
            parameters: {
                type: 'object',
                properties: { query: { type: 'string', description: 'The search query.' } },
                required: ['query'],
            },
        },
    }, {
        type: 'function',
        function: {
            name: 'execute_javascript',
            description: 'Execute sandboxed JavaScript code.',
            parameters: {
                type: 'object',
                properties: { code: { type: 'string', description: 'The JavaScript code to execute.' } },
                required: ['code'],
            },
        },
    }];

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
                const toolResults = await Promise.all(responseMessage.tool_calls.map(handleToolCall));
                messages.push(...toolResults);
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
                case 'execute_javascript':
                    content = execute_javascript(args.code);
                    break;
                default:
                    content = `Error: Unknown tool '${functionName}'`;
            }
        } catch (error) {
            content = `Error executing tool ${functionName}: ${error.message}`;
        }
        return { role: 'tool', tool_call_id: toolCall.id, content: content };
    }
    
    async function google_search(query) {
        console.log(`Searching for: ${query}`);
        if (query.toLowerCase().includes('ibm')) {
            return "IBM, founded in 1911, is a multinational technology company.";
        }
        return `No results found for "${query}". This is a simulated search.`;
    }

    function execute_javascript(code) {
        try {
            const result = (new Function(`"use strict"; return (() => { ${code} })();`))();
            return JSON.stringify(result) || String(result);
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }

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
