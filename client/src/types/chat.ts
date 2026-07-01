export interface ChatMessageType {
  role: 'user' | 'assistant';
  content: string;
  videoUrl?: string;
  loadingStage?: 'reading product page' | 'picking footage' | 'assembling video';
}
