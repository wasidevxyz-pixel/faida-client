# 🧠 BAS AI Brain (Local Microservice)

> **Part of Bilal Accounting System (BAS)**  
> **Core Developers**: **Mr. Wasi** (AI Data Gateway & Permissions) & **Bilal Shah** (Frontend AI Chat & Voice UI)

---

## 📌 Overview
The **AI Brain** is an isolated Python FastAPI microservice that provides natural language financial querying, automated KPI calculation, and intelligent screen navigation for the Bilal Accounting System (BAS). 

It communicates strictly through the authenticated Node.js ERP gateway and has **zero direct access to MongoDB**, ensuring complete database security.

---

## 🛠️ Tech Stack & Dependencies
- **Runtime:** Python 3.10+
- **Framework:** FastAPI, Uvicorn, Pydantic
- **LLM Engines:** Ollama (local models like `qwen2.5:7b-instruct`, `llama3`, `deepseek-r1`) or vLLM / OpenAI-compatible APIs

---

## 🚀 Setup & Execution

### 1. Model Installation
```bash
# Pull recommended local model via Ollama
ollama pull qwen2.5:7b-instruct
```

### 2. Virtual Environment & Dependencies
```bash
cd ai-brain
python3 -m venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment Configuration
```bash
cp .env.example .env
```
Set `AI_BRAIN_SHARED_SECRET` in `.env` (ensure the same secret is configured in `Backend/.env`).

### 4. Start the Service
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

---

## 🔒 Security & Architecture Boundary
- **Isolated from MongoDB**: The AI Brain does not connect to the database. Node.js backend fetches sanitized business data and forwards it in the request payload.
- **Action Catalog & Permissions**: The FastAPI service returns action IDs only. Node.js resolves them through `Backend/config/aiActionCatalog.js`, where every action has an explicit user permission check.
- **Stateless Memory**: Conversation context is maintained in bounded, expiring local memory and is never written to persistent disk storage.
