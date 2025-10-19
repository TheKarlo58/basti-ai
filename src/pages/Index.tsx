import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-background p-8">
      {/* Header */}
      <header className="w-full text-center">
        <h1 className="text-4xl font-light tracking-[0.3em] text-foreground">
          BASTI
        </h1>
      </header>

      {/* Time Display */}
      <div className="flex flex-col items-center justify-center">
        <time className="font-mono text-7xl tracking-wider text-foreground/90 transition-all">
          {formatTime(currentTime)}
        </time>
      </div>

      {/* Connection Button */}
      <div className="w-full flex justify-center pb-16">
        <Button
          onClick={() => setIsConnected(!isConnected)}
          variant="outline"
          className={`
            min-w-[200px] px-8 py-6 text-lg font-light tracking-widest
            transition-all duration-300 ease-in-out
            border-2 rounded-lg
            ${isConnected 
              ? 'bg-connected/20 border-connected text-connected hover:bg-connected/30' 
              : 'bg-disconnected/20 border-disconnected text-muted-foreground hover:bg-disconnected/30'
            }
          `}
        >
          {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
        </Button>
      </div>
    </main>
  );
};

export default Index;
