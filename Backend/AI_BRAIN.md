# D.WATSON AI Brain

The AI Brain now runs entirely in the Node.js backend and calls Groq directly. No Python service or local Ollama process is needed.

1. Create a Groq API key at https://console.groq.com/keys.
2. Add `GROQ_API_KEY` to `Backend/.env` (use `Backend/.env.example` as the template).
3. Restart the Node backend.

The first release is read-only and permission-aware. It supports late-employee lookups and aggregate cash-sales summaries, applying the signed-in user's branch restriction before data is sent to the model. The provider receives only the question and the minimum tool result needed to answer it; database credentials and raw database access are never exposed.
