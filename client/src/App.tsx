import { useState, useRef, useEffect } from 'react';
import './App.css';
import type { ChatMessageType } from './types/chat';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';

const API_URL = 'http://localhost:3000/api/chat';
const STORAGE_KEY = 'reelmind-chat';

const DEFAULT_WELCOME: ChatMessageType = {
  role: 'assistant',
  content: "Hi! I'm your UGC video generator. Send me a product URL (or describe your product with a link, like \"I'm building CalAI, a calorie-tracking app calai.app\") and I'll create a short 5-10s marketing video with background, captions, audio, and a reaction GIF. Or just say hi to chat!",
};

function loadChat(): ChatMessageType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [DEFAULT_WELCOME];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_WELCOME];
    return parsed;
  } catch {
    return [DEFAULT_WELCOME];
  }
}

function saveChat(messages: ChatMessageType[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessageType[]>(loadChat);
  const [isLoading, setIsLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    saveChat(messages);
  }, [messages]);

  function addMessage(msg: ChatMessageType) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      // If last message is a loading stage (has loadingStage, no content), replace it
      if (last?.loadingStage) {
        next[next.length - 1] = msg;
      } else {
        next.push(msg);
      }
      return next;
    });
  }

  function clearChat() {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([DEFAULT_WELCOME]);
  }

  async function sendMessage(message: string) {
    if (isLoading) return;

    addMessage({ role: 'user', content: message });
    setIsLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId: 'default' }),
      });

      if (!response.ok) {
        throw new Error(`Server responded ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        const completeLines = lines.slice(0, -1);
        buffer = lines[lines.length - 1] || '';

        for (const line of completeLines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.messages && parsed.messages.length > 0) {
              for (const msg of parsed.messages) {
                addMessage(msg as ChatMessageType);
              }
            }
          } catch { /* ignore */ }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.messages && parsed.messages.length > 0) {
            for (const msg of parsed.messages) {
              addMessage(msg as ChatMessageType);
            }
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Unknown error';
      addMessage({ role: 'assistant', content: `Sorry, something went wrong: ${errorText}` });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/95 px-6 pt-5 pb-3 text-left">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-medium tracking-wide">✦ UGC Video Chat</h1>
          <button
            onClick={clearChat}
            className="text-xs text-zinc-500/70 hover:text-zinc-400 transition-colors"
            title="Clear chat history"
          >
            Clear chat
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {messages.map((msg, idx) => (
            <ChatMessage key={idx} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      <ChatInput onSend={sendMessage} disabled={isLoading} />
      <footer className="border-t border-zinc-800 bg-zinc-950 px-6 py-2 text-center">
        <p className="text-xs text-zinc-600 opacity-60">Built with React, Node &amp; Gemini</p>
      </footer>
    </div>
  );
}