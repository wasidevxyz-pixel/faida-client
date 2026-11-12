# Modular BAS AI Brain

The browser and `/api/ai/chat` API do not change. The controller selects this brain when `AI_BRAIN_MODE=modular` (the default); set `AI_BRAIN_MODE=legacy` for an immediate rollback.

Flow: small LLM router → one module → authorized tool schemas only → existing Node handlers → LLM answer. Providers receive neither MongoDB credentials nor direct database access.

`modules/moduleCatalog.js` is the module documentation, examples, permission mapping, and tool membership source. Add a future module by adding a catalog item and registering its already-authorized handler in `aiDataAgentService.js`.

Memory is process-local and bounded per user/conversation. Use Redis behind `memoryManager` and `cacheManager` for multi-instance production deployments. Logs deliberately omit prompts, tool results, credentials, and PII.

## Migration

1. Deploy this folder and preserve the existing `GROQ_API_KEY`; no frontend, MongoDB schema, or business route changes are needed.
2. Set `AI_BRAIN_MODE=modular`, `AI_PROVIDER=groq`, and restart the backend. Monitor the `module_selected`, `chat_complete`, and `chat_failed` JSON events.
3. Validate sales, banking, HR, inventory, and customer prompts against the existing production answers. Roll back instantly with `AI_BRAIN_MODE=legacy` if required.
4. For horizontal scaling, replace the two in-process stores with Redis and forward the same interfaces. Add new ERP capabilities only through the module catalog and permission-checked legacy tool bridge.
