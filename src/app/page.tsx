"use client";

import { Message } from "ai";
import { useChat } from "@ai-sdk/react";
import { ChatBubble } from "@/components/chat-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRef, useEffect } from "react";

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    maxSteps: 3,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <main className="flex flex-col h-screen max-w-4xl w-full mx-auto py-10">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black">The Running Public AI</h1>
        <ThemeToggle />
      </div>

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-auto p-4 my-6 shadow-sm scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((m: Message) => (
            <ChatBubble key={m.id} message={m}>
              {m.content.length > 0 ? 
                m.content : 
                <span className="italic font-light">
                  {"calling tool: " +
                    m.parts?.find((part) => part.type === "tool-invocation")
                      ?.toolInvocation?.toolName || "unknown tool"}
                </span>
              }
            </ChatBubble>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto">
          <div className="relative w-full flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-full pl-10 pr-20 h-14"
              placeholder="Ask about running..."
              value={input}
              onChange={handleInputChange}
            />
          </div>
          <Button type="submit" className="hidden">Submit</Button>
        </form>
      </div>
    </main>
  );
}
