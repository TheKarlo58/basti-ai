import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type ConnectionState = "disconnected" | "connecting" | "connected";

const Index = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [webhookUrl, setWebhookUrl] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Load saved webhook URL
    const saved = localStorage.getItem("n8n_webhook_url");
    if (saved) setWebhookUrl(saved);

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

  const handleConnect = async () => {
    if (connectionState === "connected") {
      setConnectionState("disconnected");
      toast({
        title: "Disconnected",
        description: "Connection closed",
      });
      return;
    }

    setConnectionState("connecting");
    console.log("Connecting to n8n webhook:", webhookUrl);

    const timeoutId = setTimeout(() => {
      if (connectionState === "connecting") {
        setConnectionState("disconnected");
        toast({
          title: "Connection Failed",
          description: "Connecting to Basti failed",
          variant: "destructive",
        });
      }
    }, 5000);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors",
        body: JSON.stringify({
          action: "connect",
          timestamp: new Date().toISOString(),
          source: "basti_ai_interface"
        }),
      });

      clearTimeout(timeoutId);
      setConnectionState("connected");
      toast({
        title: "Connected",
        description: "Successfully connected to Basti",
      });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Connection error:", error);
      setConnectionState("disconnected");
      toast({
        title: "Connection Failed",
        description: "Connecting to Basti failed",
        variant: "destructive",
      });
    }
  };


  const getButtonState = () => {
    switch (connectionState) {
      case "connected":
        return {
          text: "CONNECTED",
          className: "bg-connected/20 border-connected text-connected hover:bg-connected/30"
        };
      case "connecting":
        return {
          text: "CONNECTING...",
          className: "bg-accent/20 border-accent text-accent hover:bg-accent/30 animate-pulse"
        };
      default:
        return {
          text: "DISCONNECTED",
          className: "bg-disconnected/20 border-disconnected text-muted-foreground hover:bg-disconnected/30"
        };
    }
  };

  const buttonState = getButtonState();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-background p-4 sm:p-8">
      {/* Header */}
      <header className="w-full text-center pt-8">
        <h1 className="text-6xl font-semibold tracking-[0.15em] text-foreground">
          BASTI
        </h1>
      </header>

      {/* Time Display */}
      <div className="flex flex-col items-center justify-center">
        <time className="font-mono text-5xl sm:text-7xl tracking-wider text-foreground/90 transition-all">
          {formatTime(currentTime)}
        </time>
      </div>

      {/* Connection Button */}
      <div className="w-full flex justify-center pb-8 sm:pb-16">
        <Button
          onClick={handleConnect}
          disabled={connectionState === "connecting"}
          variant="outline"
          className={`
            min-w-[280px] px-12 py-8 text-xl font-medium tracking-widest
            transition-all duration-300 ease-in-out
            border-2 rounded-lg
            ${buttonState.className}
          `}
        >
          {buttonState.text}
        </Button>
      </div>
    </main>
  );
};

export default Index;
