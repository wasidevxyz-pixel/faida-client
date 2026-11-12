const { executeTool } = require('../../services/aiDataAgentService');

function unpack(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeArguments(args) {
  // Small local models occasionally serialize a schema value twice. Normalize
  // that structured output here, before it reaches the trusted ERP handler.
  const normalized = Object.fromEntries(Object.entries(args).map(([key, raw]) => [key, unpack(raw)]));
  if (normalized.search && typeof normalized.search === 'object') {
    normalized.search = normalized.search.employeeCode || normalized.search.code || normalized.search.employeeName || normalized.search.name || normalized.search.value || '';
  }
  if (normalized.monthYear && typeof normalized.monthYear === 'object') {
    const month = normalized.monthYear.month || normalized.monthYear.monthName;
    const year = normalized.monthYear.year;
    normalized.monthYear = month && year ? `${month} ${year}` : '';
  }
  return normalized;
}

function validate(call, tools) {
  const name = call?.function?.name;
  if (!tools.some(tool => tool.function.name === name)) throw new Error('Tool is unavailable for this module or user.');
  try { return { name, args: normalizeArguments(JSON.parse(call.function.arguments || '{}')) }; }
  catch { throw new Error('AI returned invalid tool arguments.'); }
}

async function execute(req, calls, tools) {
  return Promise.all(calls.map(async call => {
    try {
      const { name, args } = validate(call, tools);
      const result = await executeTool(req, name, args);
      return { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ tool: name, result }) };
    } catch (error) {
      return { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: error.message }) };
    }
  }));
}
module.exports = { execute };
