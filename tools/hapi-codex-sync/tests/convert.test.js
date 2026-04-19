const test = require('node:test');
const assert = require('node:assert/strict');
const { convertCodexEvent } = require('../src/convert');

test('converts response_item user message into HAPI user text message', () => {
  const event = {
    timestamp: '2026-04-18T05:14:38.392Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'hello from desktop' }]
    }
  };

  assert.deepEqual(convertCodexEvent(event), {
    role: 'user',
    content: { type: 'text', text: 'hello from desktop' },
    createdAt: 1776489278392
  });
});

test('converts response_item assistant message into HAPI codex message', () => {
  const event = {
    timestamp: '2026-04-18T05:15:00.000Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'done' }],
      phase: 'final_answer'
    }
  };

  assert.deepEqual(convertCodexEvent(event), {
    role: 'agent',
    content: { type: 'codex', data: { type: 'message', message: 'done', phase: 'final_answer' } },
    createdAt: 1776489300000
  });
});

test('converts function calls and function outputs into HAPI codex tool messages', () => {
  const call = convertCodexEvent({
    timestamp: '2026-04-18T05:15:01.000Z',
    type: 'response_item',
    payload: { type: 'function_call', name: 'exec_command', call_id: 'call_1', arguments: '{"cmd":"pwd"}' }
  });
  const output = convertCodexEvent({
    timestamp: '2026-04-18T05:15:02.000Z',
    type: 'response_item',
    payload: { type: 'function_call_output', call_id: 'call_1', output: 'ok' }
  });

  assert.equal(call.role, 'agent');
  assert.deepEqual(call.content.type, 'codex');
  assert.deepEqual(call.content.data, { type: 'tool-call', name: 'exec_command', callId: 'call_1', input: { cmd: 'pwd' } });
  assert.deepEqual(output.content.data, { type: 'tool-call-result', callId: 'call_1', output: 'ok' });
});

test('converts event_msg user and agent messages and skips token counts', () => {
  assert.deepEqual(convertCodexEvent({
    timestamp: '2026-04-18T05:15:03.000Z',
    type: 'event_msg',
    payload: { type: 'user_message', message: 'mobile visible text' }
  }), {
    role: 'user',
    content: { type: 'text', text: 'mobile visible text' },
    createdAt: 1776489303000
  });

  assert.deepEqual(convertCodexEvent({
    timestamp: '2026-04-18T05:15:04.000Z',
    type: 'event_msg',
    payload: { type: 'agent_message', message: 'thinking out loud', phase: 'commentary' }
  }), {
    role: 'agent',
    content: { type: 'codex', data: { type: 'message', message: 'thinking out loud', phase: 'commentary' } },
    createdAt: 1776489304000
  });

  assert.equal(convertCodexEvent({ timestamp: '2026-04-18T05:15:05.000Z', type: 'event_msg', payload: { type: 'token_count' } }), null);
});

test('converts task_complete event into HAPI ready event', () => {
  assert.deepEqual(convertCodexEvent({
    timestamp: '2026-04-18T05:15:06.000Z',
    type: 'event_msg',
    payload: { type: 'task_complete', turn_id: 'turn-1' }
  }), {
    role: 'agent',
    content: { type: 'event', data: { type: 'ready' } },
    createdAt: 1776489306000
  });
});
