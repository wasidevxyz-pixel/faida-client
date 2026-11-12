(() => {
  // AI Assistant completely disabled per user request
  return;
  const routes = new Set(['/purchases','/payroll','/attendance-list','/employee-registration','/employee-list','/bank-management','/dashboard','/wh-sales','/wh-items','/stock-report','/purchase-report','/income-statement','/sales-report','/profit-loss-report','/ledger-report','/bank-ledger','/employee-attendance-report','/wh-stock-in-hand-report']);
  const token = () => localStorage.getItem('token');
  let ameyVoice = null;
  const setVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    ameyVoice = voices.find(v => v.name.includes('Google US English')) 
             || voices.find(v => v.name.includes('Zira'))
             || voices.find(v => v.name.includes('Samantha'))
             || voices.find(v => v.name.includes('Victoria'))
             || voices.find(v => v.lang === 'en-US');
  };
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = setVoice;
    setVoice();
  }
  const speak = (text, onEnd) => { 
    if ('speechSynthesis' in window) { 
      window.speechSynthesis.cancel(); 
      const msg = new SpeechSynthesisUtterance(text);
      if (ameyVoice) msg.voice = ameyVoice; 
      msg.onend = onEnd;
      msg.onerror = onEnd;
      window.speechSynthesis.speak(msg); 
    } else if (onEnd) {
      onEnd();
    } 
  };

  document.addEventListener('DOMContentLoaded', () => {
    let markedReady = Promise.resolve();
    if (!window.marked) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
        markedReady = new Promise(resolve => {
          script.onload = resolve;
          script.onerror = resolve;
        });
        document.head.appendChild(script);
    }
    if (!window.html2pdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        document.head.appendChild(script);
    }
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    if (!token() || !u.aiEnabled || document.querySelector('#dw-ai-launcher')) return;
    document.body.insertAdjacentHTML('beforeend', `<button id="dw-ai-launcher" aria-label="Open Amey AI Assistant" title="Chat with Amey"><span class="dw-ai-pet" aria-hidden="true"><span class="dw-ai-pet-antenna"></span><span class="dw-ai-pet-head"><span class="dw-ai-pet-eye left"></span><span class="dw-ai-pet-eye right"></span><span class="dw-ai-pet-smile"></span></span><span class="dw-ai-pet-body"><span></span><span></span></span></span></button><section class="dw-ai-panel" aria-label="Amey AI Assistant"><div class="dw-ai-resize-handle" aria-hidden="true"></div><header class="dw-ai-head" style="cursor: grab;"><div class="dw-ai-brand"><span class="dw-ai-brand-icon"><img src="/img/amey_avatar.png" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></span><div><strong>AI Assistant</strong><small class="dw-ai-online">Online</small></div></div><div class="dw-ai-actions"><button class="dw-ai-clear" title="Clear Chat History" aria-label="Clear Chat History"><i class="fas fa-trash-alt"></i></button><button class="dw-ai-pdf" title="Download Reply as PDF" aria-label="Download Reply as PDF"><i class="fas fa-file-pdf"></i></button><button class="dw-ai-sound" title="Toggle spoken replies" aria-label="Toggle spoken replies"><i class="fas fa-volume-up"></i></button><button class="dw-ai-close" aria-label="Close">×</button></div></header><main><div class="dw-ai-stage"><div class="dw-ai-avatar-zone"><i class="dw-ai-spark one">+</i><i class="dw-ai-spark two">✦</i><div class="dw-ai-avatar" style="overflow:hidden;"><img src="/img/amey_avatar.png" style="width:100%;height:100%;object-fit:cover;display:block;"></div></div><div class="dw-ai-greeting"><h2>Hi Boss!</h2><p>I’m Amey, your personal AI assistant.<br>What can I do for you?</p></div></div><div class="dw-ai-reply" aria-live="polite"></div><div class="dw-ai-divider">How would you like to interact?</div><div class="dw-ai-modes"><button class="dw-ai-mode voice" type="button"><span class="dw-ai-mode-icon"><i class="fas fa-microphone"></i></span><span><b>Voice Command</b><small>Click to speak</small></span></button><button class="dw-ai-mode text" type="button"><span class="dw-ai-mode-icon"><i class="fas fa-comment-dots"></i></span><span><b>Text Command</b><small>Type your message</small></span></button></div><form class="dw-ai-form"><input maxlength="2000" placeholder="Type your message here..." aria-label="Message" required><button aria-label="Send"><i class="fas fa-paper-plane"></i></button></form></main></section>`);
    const launcher = document.querySelector('#dw-ai-launcher'), panel = document.querySelector('.dw-ai-panel'), form = panel.querySelector('.dw-ai-form'), input = form.querySelector('input'), reply = panel.querySelector('.dw-ai-reply'), voiceButton = panel.querySelector('.dw-ai-mode.voice'), textButton = panel.querySelector('.dw-ai-mode.text'), pet = launcher.querySelector('.dw-ai-pet');
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    let petNearCursor = false;
    document.addEventListener('pointermove', event => {
      const rect = launcher.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const isNear = Math.hypot(dx, dy) < 220;
      if (isNear !== petNearCursor) {
        petNearCursor = isNear;
        launcher.classList.toggle('is-curious', isNear);
      }
      if (isNear) {
        pet.style.setProperty('--pet-look-x', `${clamp(dx / 20, -6, 6)}px`);
        pet.style.setProperty('--pet-look-y', `${clamp(dy / 30, -3, 3)}px`);
        pet.style.setProperty('--pet-tilt', `${clamp(dx / 75, -5, 5)}deg`);
      }
    }, { passive: true });
    launcher.addEventListener('pointerleave', () => {
      pet.style.removeProperty('--pet-look-x');
      pet.style.removeProperty('--pet-look-y');
      pet.style.removeProperty('--pet-tilt');
    });
    let voiceReplies = true, recognition, conversationId, continuousVoiceMode = false, voiceRequestInProgress = false;
    panel.querySelector('.dw-ai-sound i').className = 'fas fa-volume-up';
    const savePreference = value => fetch('/api/v1/ai/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token()}` }, body: JSON.stringify(value) }).catch(() => {});
    fetch('/api/v1/ai/preferences', { headers: { 'Authorization': `Bearer ${token()}` } }).then(response => response.ok ? response.json() : null).then(body => {
      if (body?.data?.voiceReplies !== undefined) {
        voiceReplies = body.data.voiceReplies;
        panel.querySelector('.dw-ai-sound i').className = voiceReplies ? 'fas fa-volume-up' : 'fas fa-volume-mute';
      }
    }).catch(() => {});
    const hideIntro = () => {
      const stage = panel.querySelector('.dw-ai-stage');
      const divider = panel.querySelector('.dw-ai-divider');
      const modes = panel.querySelector('.dw-ai-modes');
      if (stage) stage.style.display = 'none';
      if (divider) divider.style.display = 'none';
      if (modes) modes.style.display = 'none';
      reply.classList.add('show');
    };

    const addUserMessage = (text, save = true) => {
      hideIntro();
      const div = document.createElement('div');
      div.className = 'chat-bubble user';
      div.textContent = text;
      reply.appendChild(div);
      scrollToBottom();
      if (save) {
        chatHistory.push({ type: 'user', text });
        saveChatHistory();
      }
    };

    const showReply = (text, shouldSpeak = false, className = '', onSpeechEnd, save = true) => {
      hideIntro();
      const div = document.createElement('div');
      div.className = `chat-bubble ai ${className}`.trim();
      if (window.marked) {
        div.innerHTML = window.marked.parse(text);
        if (save && className !== 'thinking') {
          chatHistory.push({ type: 'ai', html: div.innerHTML, text });
          saveChatHistory();
        }
      } else {
        // Never collapse a report into one line while the Markdown library is
        // still loading (or unavailable). Upgrade it to a real table once the
        // library becomes available.
        div.textContent = text;
        div.classList.add('plain-markdown');
        if (save && className !== 'thinking') {
          chatHistory.push({ type: 'ai', html: '', text });
          saveChatHistory();
        }
        markedReady.then(() => {
          if (window.marked && div.isConnected) {
            div.innerHTML = window.marked.parse(text);
            div.classList.remove('plain-markdown');
            if (save && className !== 'thinking') {
              const lastMsg = chatHistory[chatHistory.length - 1];
              if (lastMsg && lastMsg.type === 'ai') {
                lastMsg.html = div.innerHTML;
                saveChatHistory();
              }
            }
          }
        });
      }
      reply.appendChild(div);
      scrollToBottom();

      if (shouldSpeak && voiceReplies) {
        const speechText = text.replace(/[#*`_~]/g, '').replace(/<[^>]+>/g, '');
        speak(speechText, onSpeechEnd);
      } else if (onSpeechEnd) {
        onSpeechEnd();
      }
      return div;
    };

    const scrollToBottom = () => {
      const main = panel.querySelector('main');
      main.scrollTop = main.scrollHeight;
    };

    const saveChatHistory = () => {
      localStorage.setItem('dw_ai_chat', JSON.stringify(chatHistory));
      if (conversationId) localStorage.setItem('dw_ai_conversation_id', conversationId);
    };

    const navEntry = performance.getEntriesByType("navigation")[0];
    if (navEntry && navEntry.type === 'reload') {
      localStorage.removeItem('dw_ai_chat');
      localStorage.removeItem('dw_ai_conversation_id');
    }
    
    let chatHistory = JSON.parse(localStorage.getItem('dw_ai_chat') || '[]');
    conversationId = localStorage.getItem('dw_ai_conversation_id') || undefined;

    const clearChatHistory = () => {
      chatHistory = [];
      conversationId = undefined;
      localStorage.removeItem('dw_ai_chat');
      localStorage.removeItem('dw_ai_conversation_id');
      reply.innerHTML = '';
      const stage = panel.querySelector('.dw-ai-stage');
      const divider = panel.querySelector('.dw-ai-divider');
      const modes = panel.querySelector('.dw-ai-modes');
      if (stage) stage.style.display = '';
      if (divider) divider.style.display = '';
      if (modes) modes.style.display = '';
      reply.classList.remove('show');
    };

    const restoreChatHistory = () => {
      if (chatHistory.length > 0) {
        hideIntro();
        chatHistory.forEach(msg => {
          const div = document.createElement('div');
          div.className = `chat-bubble ${msg.type}`;
          if (msg.type === 'ai') {
            if (msg.html) {
              div.innerHTML = msg.html;
            } else {
              div.textContent = msg.text;
            }
          } else {
            div.textContent = msg.text;
          }
          reply.appendChild(div);
        });
        scrollToBottom();
      }
    };
    restoreChatHistory();
    const resetPanelGeometry = () => {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.right = '';
      panel.style.margin = '';
      panel.style.transform = '';
      panel.style.transition = '';
      panel.style.width = '';
      panel.style.maxHeight = '';
    };

    launcher.onclick = () => { 
      panel.classList.toggle('is-open'); 
      if (panel.classList.contains('is-open')) {
        input.focus(); 
      } else {
        resetPanelGeometry();
      }
    };
    panel.querySelector('.dw-ai-close').onclick = () => {
      panel.classList.remove('is-open');
      resetPanelGeometry();
    };
    const clearBtn = panel.querySelector('.dw-ai-clear');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('Are you sure you want to clear the AI chat history?')) {
          clearChatHistory();
        }
      };
    }
    panel.querySelector('.dw-ai-pdf').onclick = () => {
      if (!window.html2pdf || !reply.textContent.trim()) return;
      const opt = { margin: 0.5, filename: 'AI-Response.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `<h2 style="color:#2c5ba9; font-family:sans-serif; text-align:center;">AI Assistant Response</h2><div style="font-family:sans-serif; font-size:14px; padding:20px;">${reply.innerHTML}</div>`;
      html2pdf().set(opt).from(wrapper).save();
    };
    
    // Make panel draggable (mouse + touch) with viewport bounds clamping
    const head = panel.querySelector('.dw-ai-head');
    let isDragging = false, startX, startY, initialX, initialY;
    
    const dragStart = (e) => {
      if (e.target.closest('button')) return;
      isDragging = true; head.style.cursor = 'grabbing';
      const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
      startX = clientX; startY = clientY;
      const rect = panel.getBoundingClientRect();
      initialX = rect.left; initialY = rect.top;
      panel.style.bottom = 'auto'; panel.style.right = 'auto'; panel.style.margin = '0';
      panel.style.transform = 'none';
      panel.style.transition = 'none';
    };
    
    const dragMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
      const dx = clientX - startX; const dy = clientY - startY;
      const rect = panel.getBoundingClientRect();
      const newLeft = clamp(initialX + dx, 0, window.innerWidth - rect.width);
      const newTop  = clamp(initialY + dy, 0, window.innerHeight - rect.height);
      panel.style.left = `${newLeft}px`; panel.style.top = `${newTop}px`;
    };
    
    const dragEnd = () => { isDragging = false; head.style.cursor = 'grab'; };

    head.addEventListener('mousedown', dragStart);
    head.addEventListener('touchstart', dragStart, {passive: true});
    document.addEventListener('mousemove', dragMove, {passive: false});
    document.addEventListener('touchmove', dragMove, {passive: false});
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);

    // Resize handle — bottom-right corner
    const resizeHandle = panel.querySelector('.dw-ai-resize-handle');
    let isResizing = false, resizeStartX, resizeStartY, resizeInitW, resizeInitH;
    const MIN_W = 260, MIN_H = 180;

    const resizeStart = (e) => {
      isResizing = true;
      const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
      resizeStartX = clientX; resizeStartY = clientY;
      const rect = panel.getBoundingClientRect();
      resizeInitW = rect.width; resizeInitH = rect.height;
      // Lock position so resize doesn't shift the panel
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = `${rect.left}px`; panel.style.top = `${rect.top}px`;
      panel.style.transition = 'none';
      e.preventDefault();
    };

    const resizeMove = (e) => {
      if (!isResizing) return;
      e.preventDefault();
      const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
      const newW = clamp(resizeInitW + (clientX - resizeStartX), MIN_W, window.innerWidth - panel.getBoundingClientRect().left - 8);
      const newH = clamp(resizeInitH + (clientY - resizeStartY), MIN_H, window.innerHeight - panel.getBoundingClientRect().top - 8);
      panel.style.width  = `${newW}px`;
      panel.style.maxHeight = `${newH}px`;
    };

    const resizeEnd = () => { isResizing = false; };

    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', resizeStart);
      resizeHandle.addEventListener('touchstart', resizeStart, { passive: false });
    }
    document.addEventListener('mousemove', resizeMove, { passive: false });
    document.addEventListener('touchmove', resizeMove, { passive: false });
    document.addEventListener('mouseup', resizeEnd);
    document.addEventListener('touchend', resizeEnd);

    const startVoiceListening = () => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!continuousVoiceMode || recognition || input.disabled || !Recognition) return;
      recognition = new Recognition();
      recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => { panel.classList.add('listening'); voiceButton.classList.add('active'); };
      recognition.onresult = event => {
        voiceRequestInProgress = true;
        input.value = event.results[0][0].transcript;
        recognition.stop();
        form.requestSubmit();
      };
      recognition.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          continuousVoiceMode = false;
          showReply('Microphone access is blocked. Please allow microphone access and try again.');
        }
      };
      recognition.onend = () => {
        recognition = null;
        panel.classList.remove('listening'); voiceButton.classList.remove('active');
        if (continuousVoiceMode && !voiceRequestInProgress && !input.disabled) setTimeout(startVoiceListening, 300);
      };
      recognition.start();
    };

    const resumeVoiceConversation = () => {
      if (continuousVoiceMode) setTimeout(startVoiceListening, 300);
    };

    textButton.onclick = () => {
      continuousVoiceMode = false;
      voiceRequestInProgress = false;
      if (recognition) recognition.stop();
      input.focus();
    };
    // Some browsers/mobile keyboards do not reliably submit a dynamically
    // inserted form on Enter, so submit the chat explicitly.
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || input.disabled) return;
      event.preventDefault();
      form.requestSubmit();
    });
    panel.querySelector('.dw-ai-sound').onclick = () => { voiceReplies = !voiceReplies; savePreference({ voiceReplies }); panel.querySelector('.dw-ai-sound i').className = voiceReplies ? 'fas fa-volume-up' : 'fas fa-volume-mute'; showReply(voiceReplies ? 'Spoken replies are on.' : 'Spoken replies are off.'); };
    voiceButton.onclick = () => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) return showReply('Voice input is not supported by this browser. Try Chrome or Edge.');
      if (continuousVoiceMode) {
        continuousVoiceMode = false;
        voiceRequestInProgress = false;
        if (recognition) recognition.stop();
        return;
      }
      continuousVoiceMode = true;
      showReply('Continuous voice conversation is on. I am listening.');
      startVoiceListening();
    };
    form.onsubmit = async event => {
      event.preventDefault(); const message = input.value.trim(); if (!message) return;
      addUserMessage(message);
      input.value = ''; input.disabled = true;
      const thinkingReply = showReply('Amey is thinking…', false, 'thinking');
      try {
        const response = await fetch('/api/v1/ai/chat', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token()}`}, body:JSON.stringify({ message, conversationId }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.detail || body.message || 'Assistant request failed');
        conversationId = body.data.conversation_id || conversationId;
        saveChatHistory();
        thinkingReply.remove();
        // Opening a tab after an awaited request can be blocked as a popup. Keep
        // the automatic open attempt, but always render a user-clickable link
        // for payroll slips so the document remains accessible.
        const salarySlipUrl = body.data.downloadUrl?.startsWith('/print-payroll?') ? body.data.downloadUrl : '';
        const ugCommissionPrintUrl = body.data.printUrl?.startsWith('/employee-sale-commission?printId=')
          ? body.data.printUrl
          : '';
        const replyLinks = [
          salarySlipUrl ? `[View / Print Salary Slip](${salarySlipUrl})` : '',
          ugCommissionPrintUrl ? `[View / Print UG Commission](${ugCommissionPrintUrl})` : ''
        ].filter(Boolean);
        const answer = replyLinks.length
          ? `${body.data.answer}\n\n${replyLinks.join('\n\n')}`
          : body.data.answer;
        showReply(answer, true, '', resumeVoiceConversation);
        if (body.data.downloadUrl) {
          if (body.data.downloadUrl.startsWith('/print-payroll?') || body.data.downloadUrl.startsWith('/print-invoice?') || body.data.downloadUrl.startsWith('/wh-print?') || body.data.downloadUrl.startsWith('/print-employee-attendance-report?')) {
            window.open(body.data.downloadUrl, '_blank', 'noopener');
            return;
          }
          const pdfResponse = await fetch(body.data.downloadUrl, { headers: { 'Authorization': `Bearer ${token()}` } });
          if (!pdfResponse.ok) throw new Error('The document could not be downloaded.');
          const pdfUrl = URL.createObjectURL(await pdfResponse.blob());
          window.open(pdfUrl, '_blank', 'noopener');
        }
        if (['navigate', 'open_report'].includes(body.data.action?.type) && routes.has(body.data.action.route)) { const params = new URLSearchParams(body.data.action.params || {}); setTimeout(() => window.location.assign(`${body.data.action.route}${params.toString() ? `?${params}` : ''}`), 700); }
      } catch (error) { thinkingReply.remove(); showReply(error.message, true, '', resumeVoiceConversation); } finally { input.disabled = false; input.focus(); voiceRequestInProgress = false; if (continuousVoiceMode && !voiceReplies) resumeVoiceConversation(); }
    };
  });
})();
