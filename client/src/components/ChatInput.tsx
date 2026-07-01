import { useState, FormEvent } from 'react';

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-zinc-800 bg-zinc-900 p-4">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Send a message or paste a product URL…"
        disabled={disabled}
        className="flex-1 rounded-full bg-zinc-800 px-5 py-3 text-zinc-100 placeholder-zinc-500 outline-none ring-purple-500 focus:ring-2"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="rounded-full bg-purple-600 px-6 py-3 font-medium text-white disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
