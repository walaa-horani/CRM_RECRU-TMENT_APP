"use client";

import { useRef, useEffect, useState } from "react";
import { Sparkles, X, Send, Bot, User, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm/store";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "Suggest top candidates for our open positions",
  "Summarize panel feedback from recent interviews",
  "Search candidates with React and TypeScript skills",
];

function getMessageText(m: UIMessage): string {
  if (Array.isArray(m.parts)) {
    return m.parts
      .map((p) => {
        if (p.type === "text" && typeof p.text === "string") return p.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function AstraDrawer() {
  const { data, tenantId, toggleAstra } = useCrm();
  const tenant = data[tenantId];
  const isPro = tenant?.plan === "pro";
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat<UIMessage>({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
    messages: [
      {
        id: "astra-welcome",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "👋 Hi! I'm Astra, your AI recruitment copilot. I can match candidates to jobs with pgvector, summarize interview panel notes, and draft client outreach emails. What would you like to work on?",
          },
        ],
      },
    ],
  });

  const isLoading = status === "streaming" || status === "submitted";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    try {
      await sendMessage({ text: trimmed });
    } catch (err) {
      console.error("Failed to send message to Astra:", err);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Sparkles className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-heading text-base font-semibold">Astra</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Copilot
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="size-3 text-emerald-500" />
              Tenant Isolated • pgvector RLS
            </p>
          </div>
        </div>
        <button
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          onClick={toggleAstra}
          aria-label="Close Astra drawer"
        >
          <X className="size-4" />
        </button>
      </div>

      {isPro ? (
        <>
          {/* Chat Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => {
              const isUser = m.role === "user";
              const text = getMessageText(m);
              if (!text) return null;

              return (
                <div
                  key={m.id}
                  className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}
                >
                  {!isUser && (
                    <div className="size-7 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/20">
                      <Bot className="size-4" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                      isUser
                        ? "bg-primary text-primary-foreground font-normal"
                        : "bg-muted text-foreground border border-border/60",
                    )}
                  >
                    {text}
                  </div>
                  {isUser && (
                    <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                      <User className="size-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="size-7 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/20">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-lg px-3.5 py-2.5 text-sm bg-muted text-muted-foreground border border-border/60 flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Astra is analyzing vectors and drafting response...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          {messages.length <= 2 && (
            <div className="px-4 py-2 border-t border-border/40 bg-muted/20">
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                Suggested Actions:
              </p>
              <div className="flex flex-col gap-1.5">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(prompt)}
                    className="text-left text-xs p-2 rounded-md bg-card hover:bg-accent border border-border text-foreground transition-colors flex items-center justify-between group"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="size-3 text-muted-foreground group-hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Form */}
          <div className="border-t border-border p-3 bg-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Ask Astra (e.g. 'Match candidates for React Lead')..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />
              <Button type="submit" size="sm" disabled={isLoading || !input.trim()} className="gap-1 px-3">
                <Send className="size-3.5" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="size-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
            <Sparkles className="size-6" />
          </div>
          <p className="font-heading text-lg font-medium">Astra is a Pro feature</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Upgrade {tenant?.name || "your agency"} to Pro to unlock Astra AI Copilot for candidate
            vector matching, interview feedback summaries, and client outreach.
          </p>
          <Button size="sm">Upgrade to Pro</Button>
        </div>
      )}
    </div>
  );
}
