import { cn } from "@/lib/utils";
import { Message } from "ai";
import { ReactNode } from "react";
import ReactMarkdown from 'react-markdown';

interface ChatBubbleProps {
  message: Message;
  children: ReactNode;
}

export function ChatBubble({ message, children }: ChatBubbleProps) {
  const isUser = message.role === "user";
  
  return (
    <div className={cn(
      "flex w-full",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "rounded-lg px-4 py-3 max-w-[80%]",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        {typeof children === 'string' ? (
          <div className={cn(
            "prose prose-sm break-words", 
            isUser ? "" : "dark:prose-invert"
          )}>
            <ReactMarkdown
              components={{
                a: ({ node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                )
              }}
            >
              {children}
            </ReactMarkdown>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
} 