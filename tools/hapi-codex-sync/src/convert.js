function timestampMs(event) {
  const parsed = Date.parse(event.timestamp || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function textFromContent(content, inputType, outputType) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === inputType || part.type === outputType || part.type === 'text') {
        return typeof part.text === 'string' ? part.text : '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseArgs(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function hapiUser(text, createdAt) {
  if (!text) return null;
  return { role: 'user', content: { type: 'text', text }, createdAt };
}

function hapiAgent(data, createdAt) {
  return { role: 'agent', content: { type: 'codex', data }, createdAt };
}

function hapiEvent(data, createdAt) {
  return { role: 'agent', content: { type: 'event', data }, createdAt };
}

function convertCodexEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const createdAt = timestampMs(event);
  const payload = event.payload || {};

  if (event.type === 'response_item') {
    if (payload.type === 'message') {
      if (payload.role === 'user') {
        return hapiUser(textFromContent(payload.content, 'input_text', 'output_text'), createdAt);
      }
      if (payload.role === 'assistant') {
        const message = textFromContent(payload.content, 'input_text', 'output_text');
        if (!message) return null;
        return hapiAgent({ type: 'message', message, phase: payload.phase }, createdAt);
      }
    }
    if (payload.type === 'function_call') {
      return hapiAgent({
        type: 'tool-call',
        name: payload.name,
        callId: payload.call_id || payload.callId,
        input: parseArgs(payload.arguments)
      }, createdAt);
    }
    if (payload.type === 'function_call_output') {
      return hapiAgent({
        type: 'tool-call-result',
        callId: payload.call_id || payload.callId,
        output: payload.output
      }, createdAt);
    }
    return null;
  }

  if (event.type === 'event_msg') {
    if (payload.type === 'user_message') {
      return hapiUser(payload.message || '', createdAt);
    }
    if (payload.type === 'agent_message') {
      return hapiAgent({ type: 'message', message: payload.message || '', phase: payload.phase }, createdAt);
    }
    if (payload.type === 'task_complete') {
      return hapiEvent({ type: 'ready' }, createdAt);
    }
    if (payload.type === 'exec_command_begin') {
      return hapiAgent({ type: 'tool-call', name: 'CodexBash', callId: payload.call_id, input: { command: payload.command, cwd: payload.cwd } }, createdAt);
    }
    if (payload.type === 'exec_command_end') {
      return hapiAgent({ type: 'tool-call-result', callId: payload.call_id, output: payload }, createdAt);
    }
    return null;
  }

  return null;
}

module.exports = { convertCodexEvent };
