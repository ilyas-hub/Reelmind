import type { ChatMessageType } from '../types/chat';

interface Props {
  message: ChatMessageType;
}

function getTimestamp() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-left ${
          isUser
            ? 'bg-purple-600 text-white rounded-br-sm'
            : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
        }`}
      >
        {message.loadingStage && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-purple-500" />
            {message.loadingStage}…
          </div>
        )}

        {!message.loadingStage && message.content && (
          <p className="whitespace-pre-wrap text-base">{message.content}</p>
        )}

        <p className={`mt-1 text-xs ${isUser ? 'text-purple-200/50' : 'text-zinc-500/50'}`}>
          {getTimestamp()}
        </p>

        {message.videoUrl && (
          <div className="mt-3">
            <div className="flex justify-center">
              <video
                src={message.videoUrl}
                controls
                playsInline
                className="max-h-[70vh] w-auto rounded-lg bg-black"
                style={{ aspectRatio: '9 / 16', maxWidth: '100%' }}
              />
            </div>
            <div className="mt-3 flex items-center gap-3 justify-center">
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = message.videoUrl!;
                  a.download = '';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/50 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                title="Download video"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="inline-block">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download
              </button>
              <span className="text-zinc-600 select-none">|</span>
              <button
                onClick={() => navigator.clipboard.writeText(message.videoUrl!)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/50 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                title="Copy video URL"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="inline-block">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2h4a2 2 0 012 2v4" />
                </svg>
                Copy URL
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}