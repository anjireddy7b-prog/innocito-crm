import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import { useAiChat, AiChatMessage } from '@/api/ai';
import { cn } from '@/lib/utils';

// Phase 14 (AI), conversational CRM assistant. Rendered unconditionally in AppLayout, same
// "returns null the vast majority of the time" shape as ImpersonationBanner — here it's gated on
// AI_FEATURES_USE rather than an impersonation session. Deliberately NOT a route/page: it's a
// floating panel available from anywhere in the app, since the whole point is being able to ask
// a pipeline question without leaving whatever you're looking at.
//
// Stateless server-side (see backend/src/modules/ai/ai.service.ts's runAiChat) — this component
// is the one place that history actually lives, in plain component state; it resends the whole
// visible transcript on every turn and never persists it (a refresh clears it, by design for
// this MVP).
export function AiChatPanel() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const chat = useAiChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, chat.isPending]);

  if (!hasPermission(PERMISSIONS.AI_FEATURES_USE)) return null;

  async function handleSend() {
    const content = input.trim();
    if (!content || chat.isPending) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    try {
      const result = await chat.mutateAsync(next);
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${apiErrorMessage(err, 'request failed')}` }]);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[480px] w-96 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-glass">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> AI Assistant
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask about your pipeline, a specific lead, or what's open right now — e.g. "what leads are in negotiation?"
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                  m.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
            {chat.isPending && <div className="max-w-[85%] rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">Thinking…</div>}
          </div>

          <div className="flex items-end gap-2 border-t border-border/60 p-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question…"
              rows={1}
              className="min-h-9 resize-none"
            />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} loading={chat.isPending} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Button
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full p-0 shadow-glass"
        onClick={() => setOpen((o) => !o)}
        aria-label="AI Assistant"
      >
        <Sparkles className="h-5 w-5" />
      </Button>
    </>
  );
}
