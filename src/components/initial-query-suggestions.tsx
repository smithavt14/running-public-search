"use client";

import { INITIAL_QUERIES } from "@/lib/ai/config";
import { Card } from "@/components/ui/card";
import { ChangeEvent, FormEvent, useState, useEffect } from "react";

interface InitialQuerySuggestionsProps {
  setInput: (e: string | ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export function InitialQuerySuggestions({ 
  setInput, 
  handleSubmit 
}: InitialQuerySuggestionsProps) {
  // Start with empty array to prevent hydration mismatch
  const [randomQueries, setRandomQueries] = useState<string[]>([]);
  
  // Select random queries only on the client side after hydration
  useEffect(() => {
    const shuffled = [...INITIAL_QUERIES].sort(() => 0.5 - Math.random());
    setRandomQueries(shuffled.slice(0, 3));
  }, []);
  
  const handleQueryClick = (query: string) => {
    // Set the input to the query text
    setInput(query);
    
    // Create a fake form event for submission
    const fakeSubmitEvent = {
      preventDefault: () => {},
      currentTarget: null,
    } as unknown as FormEvent<HTMLFormElement>;
    
    handleSubmit(fakeSubmitEvent);
  };

  if (randomQueries.length === 0) {
    return null; // Don't render anything until client-side effect runs
  }

  return (
    <div className="w-full space-y-4 px-4">
      <h3 className="text-lg font-medium">Try asking about:</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {randomQueries.map((query, index) => (
          <Card 
            key={index} 
            className="p-4 hover:bg-muted cursor-pointer transition-colors flex items-center justify-center"
            onClick={() => handleQueryClick(query)}
          >
            <p className="text-sm">{query}</p>
          </Card>
        ))}
      </div>
    </div>
  );
} 