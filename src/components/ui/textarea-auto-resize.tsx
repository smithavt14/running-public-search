"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaAutoResizeProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxHeight?: number;
}

const TextareaAutoResize = React.forwardRef<HTMLTextAreaElement, TextareaAutoResizeProps>(
  ({ className, value, onChange, maxHeight, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    
    // Combine refs
    const handleRef = (element: HTMLTextAreaElement) => {
      textareaRef.current = element;
      if (typeof ref === "function") {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    };

    // Resize handler with max height check
    const resizeTextarea = React.useCallback(() => {
      if (textareaRef.current) {
        // Reset height to measure scrollHeight accurately
        textareaRef.current.style.height = "auto";
        
        // Determine the new height
        const scrollHeight = textareaRef.current.scrollHeight;
        
        // If maxHeight is provided, cap the height
        if (maxHeight && scrollHeight > maxHeight) {
          textareaRef.current.style.height = `${maxHeight}px`;
          // When we hit max height, ensure content doesn't get cut off
          textareaRef.current.style.overflowY = "auto";
        } else {
          textareaRef.current.style.height = `${scrollHeight}px`;
          // Reset overflow when below max height
          textareaRef.current.style.overflowY = "hidden";
        }
      }
    }, [maxHeight]);

    // Handle onChange events
    const handleOnChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (onChange) {
        onChange(e);
      }
      resizeTextarea();
    };

    // Auto-resize on mount and when content changes
    React.useEffect(() => {
      resizeTextarea();
    }, [value, resizeTextarea]);

    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm break-words",
          className
        )}
        ref={handleRef}
        onChange={handleOnChange}
        value={value}
        {...props}
      />
    );
  }
);

TextareaAutoResize.displayName = "TextareaAutoResize";

export { TextareaAutoResize }; 