"use client";

import { Message } from "ai";
import { useChat } from "@ai-sdk/react";

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    maxSteps: 3,
  });

  return (
    <main className="flex flex-col h-screen max-w-4xl w-full mx-auto py-10">
      {/* Header */}
      <h1 className="text-2xl text-center font-black">The Running Public AI</h1>

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((m: Message) => (
            <div
              key={m.id}
              className={`chat ${
                m.role === "user" ? "chat-end" : "chat-start"
              }`}
            >
              <div
                className={`chat-bubble ${
                  m.role === "user"
                    ? "chat-bubble-secondary"
                    : "chat-bubble-primary"
                }`}
              >
                <div className="font-bold">{m.role}</div>
                {m.content.length > 0 ? (
                  m.content
                ) : (
                  <span className="italic font-light">
                    {"calling tool: " +
                      m.parts?.find((part) => part.type === "tool-invocation")
                        ?.toolInvocation?.toolName || "unknown tool"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto">
          <label className="input w-full h-16 flex items-center">
            <svg
              className="h-[1em] opacity-50"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <g
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeWidth="2.5"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </g>
            </svg>
            <input
              type="search"
              className="grow"
              placeholder="Ask about running..."
              value={input}
              onChange={handleInputChange}
            />
            <kbd className="kbd kbd-sm">⌘</kbd>
            <kbd className="kbd kbd-sm">K</kbd>
          </label>
        </form>
      </div>
    </main>
  );
}
