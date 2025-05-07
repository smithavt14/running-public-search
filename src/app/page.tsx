"use client";

import { useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState<{ sender: "user" | "bot", text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    // Add user message
    setMessages([...messages, { sender: "user", text: inputText }]);
    
    // Mock bot response - in a real app, you'd call your API here
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: "bot", text: `You said: ${inputText}` }]);
    }, 500);
    
    setInputText("");
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 md:px-10 py-20 flex flex-col h-screen font-body">
      <h1 className="text-2xl mx-auto font-bold mb-4 font-title text-center">SEARCH THE RUNNING PUBLIC PODCAST</h1>
      
      {/* Chat messages */}
      <div className="flex-grow overflow-auto mb-4 space-y-4 py-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 my-20">
            Start a conversation by typing a message below
          </div>
        )}
        
        {messages.map((message, index) => (
          <div key={index} className={`chat ${message.sender === "user" ? "chat-end" : "chat-start"}`}>
            <div className={`chat-bubble ${message.sender === "user" ? "chat-bubble-primary" : "chat-bubble-secondary"}`}>
              {message.text}
            </div>
          </div>
        ))}
      </div>
      
      {/* Input form */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="w-full rounded-xl border border-gray-300 ">
          <textarea 
            className="w-full resize-none rounded-xl px-4 py-3 pr-16 focus:outline-none min-h-[56px] max-h-[200px]"
            placeholder="Type your message here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button 
            type="submit" 
            className="absolute translate-y-1/2 right-2 p-2 rounded-lg bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!inputText.trim()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
