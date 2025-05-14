"use client";

import { Message } from "ai";
import { useChat } from "@ai-sdk/react";
import { ChatBubble } from "@/components/chat-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextareaAutoResize } from "@/components/ui/textarea-auto-resize";
import { Search, Heart } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRef, useEffect, FormEvent, ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { InitialQuerySuggestions } from "@/components/initial-query-suggestions";
import { Spinner } from "@/components/ui/spinner";

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    maxSteps: 3,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Custom handler for input changes that can handle both string and event inputs
  const handleInputWrapper = (
    e: string | ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>
  ) => {
    if (typeof e === "string") {
      // Create a synthetic event if we get a string
      const syntheticEvent = {
        target: { value: e },
        currentTarget: { value: e },
      } as ChangeEvent<HTMLInputElement>;
      handleInputChange(syntheticEvent);
    } else {
      // Pass through the event if it's already an event
      handleInputChange(e);
    }
  };

  // Custom submit wrapper for initial query suggestions
  const handleSuggestionSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(e);
  };

  return (
    <main className="flex flex-col h-screen max-w-4xl w-full mx-auto pt-10">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 px-6 md:px-0">
        <div className="flex items-center gap-12">
          <Image
            src="/logo.png"
            alt="The Running Public"
            width={64}
            height={64}
            priority
          />
          <div className="items-center gap-6 hidden md:flex">
            <Link
              href="https://therunningpublic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="relative after:absolute after:bg-primary after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:mb-[-4px] hover:after:w-full after:transition-all after:duration-300"
            >
              Website
            </Link>
            <Link
              href="https://therunningpublic.podbean.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="relative after:absolute after:bg-primary after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:mb-[-4px] hover:after:w-full after:transition-all after:duration-300"
            >
              Podcast
            </Link>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Welcome Message & Query Suggestions */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="max-w-3xl w-full px-4 py-8">
            <h2 className="text-xl font-bold mb-8">
              Welcome to The Running Public Podcast AI Assistant
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8 hidden md:block">
              Ask me anything about running advice, training techniques, gear
              recommendations, nutrition, race preparation, or specific episodes
              with Kirk DeWindt and Brakken Kraker. I can search for topics,
              list episodes, provide episode details, or tell you about podcast
              guests.
            </p>

            <InitialQuerySuggestions
              setInput={handleInputWrapper}
              handleSubmit={handleSuggestionSubmit}
            />
          </div>
        </div>
      )}

      {/* Chat Messages Container */}
      <div
        className={`overflow-auto p-4 scrollbar-hide ${
          messages.length > 0 ? "flex-1" : "hidden"
        }`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((m: Message) => (
            <ChatBubble key={m.id} message={m}>
              {m.content.length > 0 ? (
                m.content
              ) : (
                <span className="flex items-center gap-2 animate-pulse">
                  <Spinner size="sm" />
                  <span className="italic font-light">Thinking...</span>
                </span>
              )}
            </ChatBubble>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form */}
      <div className="px-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground z-10" />
            <TextareaAutoResize
              className="w-full pl-10 min-h-[48px] py-3 resize-none"
              placeholder="Ask me anything..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
                }
              }}
              rows={1}
              maxHeight={200}
            />
          </div>
          <Button type="submit" className="hidden">
            Submit
          </Button>
        </form>
      </div>

      {/* Footer */}
      <div className="flex justify-center md:justify-between items-center text-sm text-muted-foreground py-6 px-4">
        <div>
          Made with <Heart className="inline h-4 w-4 text-gray-500 mx-1" /> by{" "}
          <Link
            href="https://alex.cn.com"
            target="_blank"
            className="relative after:absolute after:bg-primary after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:mb-[-2px] hover:after:w-full after:transition-all after:duration-300"
          >
            Alex Smith
          </Link>
        </div>
        <div className="hidden md:block">© {new Date().getFullYear()} The Running Public Search</div>
      </div>
    </main>
  );
}
