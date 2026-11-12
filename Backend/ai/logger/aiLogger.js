function event(name, fields = {}) {
  // Do not log prompts, tool results, tokens, credentials, or PII.
  console.info(JSON.stringify({ service: 'ai-brain', event: name, at: new Date().toISOString(), ...fields }));
}
function error(name, err, fields = {}) {
  console.error(JSON.stringify({ service: 'ai-brain', event: name, at: new Date().toISOString(), message: err.message, ...fields }));
}
module.exports = { event, error };
