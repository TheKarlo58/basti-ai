import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WebSocketAudioHandler } from "@/utils/webSocketAudio";
import { Volume2, VolumeX } from "lucide-react";

type RecordingState = "idle" | "connecting" | "recording";

const Index = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMuted, setIsMuted] = useState(false);
  const { toast } = useToast();
  
  const webSocketHandlerRef = useRef<WebSocketAudioHandler | null>(null);
  const permissionCheckIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
      webSocketHandlerRef.current?.stop();
      if (permissionCheckIntervalRef.current) {
        clearInterval(permissionCheckIntervalRef.current);
      }
    };
  }, []);

  // Monitor microphone permission changes
  useEffect(() => {
    if (recordingState === "recording") {
      permissionCheckIntervalRef.current = window.setInterval(async () => {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (permissionStatus.state === 'denied' || permissionStatus.state === 'prompt') {
            webSocketHandlerRef.current?.stop();
            webSocketHandlerRef.current = null;
            setRecordingState("idle");
            toast({
              title: "Microphone Access Lost",
              description: "Microphone access was revoked",
              variant: "destructive",
            });
            if (permissionCheckIntervalRef.current) {
              clearInterval(permissionCheckIntervalRef.current);
              permissionCheckIntervalRef.current = null;
            }
          }
        } catch (error) {
          // Permissions API might not be fully supported
        }
      }, 1000);
    } else {
      if (permissionCheckIntervalRef.current) {
        clearInterval(permissionCheckIntervalRef.current);
        permissionCheckIntervalRef.current = null;
      }
    }

    return () => {
      if (permissionCheckIntervalRef.current) {
        clearInterval(permissionCheckIntervalRef.current);
        permissionCheckIntervalRef.current = null;
      }
    };
  }, [recordingState, toast]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const handleError = (error: Error) => {
    console.error("Error:", error);
    setRecordingState("idle");
    
    toast({
      title: "Connection Error",
      description: error.message,
      variant: "destructive",
    });
  };

  const handleConnectionChange = (connected: boolean) => {
    if (!connected && recordingState === "recording") {
      setRecordingState("idle");
    }
  };

  const toggleRecording = async () => {
    if (recordingState === "recording") {
      webSocketHandlerRef.current?.stop();
      webSocketHandlerRef.current = null;
      setRecordingState("idle");
      if (permissionCheckIntervalRef.current) {
        clearInterval(permissionCheckIntervalRef.current);
        permissionCheckIntervalRef.current = null;
      }
      toast({
        title: "Stopped",
        description: "Recording ended",
      });
    } else if (recordingState === "idle") {
      setRecordingState("connecting");

      // Check permission status first
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        
        if (permissionStatus.state === 'denied') {
          setRecordingState("idle");
          toast({
            title: "Microphone Access Blocked",
            description: "Please enable microphone access in your browser settings",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        // Permissions API not fully supported, continue anyway
      }

      // Initialize WebSocket handler
      webSocketHandlerRef.current = new WebSocketAudioHandler(
        handleError,
        handleConnectionChange
      );
      
      try {
        // Connect to WebSocket
        await webSocketHandlerRef.current.connect();
        
        // Start recording
        await webSocketHandlerRef.current.startRecording();
        
        setRecordingState("recording");
        toast({
          title: "Recording",
          description: "Listening",
        });
      } catch (error) {
        setRecordingState("idle");
        webSocketHandlerRef.current?.stop();
        webSocketHandlerRef.current = null;
        
        if (error instanceof Error) {
          if (error.message.includes('Permission denied') || error.name === 'NotAllowedError') {
            toast({
              title: "Microphone Access Denied",
              description: "This Website needs microphone access to work properly",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Failed to connect to Basti",
              description: error.message,
              variant: "destructive",
            });
          }
        }
      }
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    webSocketHandlerRef.current?.setMuted(newMutedState);
    toast({
      title: newMutedState ? "Muted" : "Unmuted",
      description: newMutedState ? "Audio output muted" : "Audio output unmuted",
    });
  };


  const getButtonState = () => {
    if (recordingState === "recording") {
      return {
        text: "HANG UP",
        className: "bg-connected/20 border-connected text-connected hover:bg-connected/30"
      };
    }
    if (recordingState === "connecting") {
      return {
        text: "CONNECTING...",
        className: "bg-disconnected/20 border-disconnected text-muted-foreground hover:bg-disconnected/30"
      };
    }
    return {
      text: "TALK",
      className: "bg-disconnected/20 border-disconnected text-muted-foreground hover:bg-disconnected/30"
    };
  };

  const buttonState = getButtonState();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-background p-4 sm:p-8">
      {/* Header */}
      <header className="w-full text-center pt-4">
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

      {/* Buttons */}
      <div className="w-full flex justify-center items-center gap-4 pb-8 sm:pb-16">
        <Button
          onClick={toggleRecording}
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
        
        <Button
          onClick={toggleMute}
          variant="outline"
          size="icon"
          className={`
            h-[72px] w-[72px] text-xl
            transition-all duration-300 ease-in-out
            border-2 rounded-lg
            ${isMuted 
              ? "bg-destructive/20 border-destructive text-destructive hover:bg-destructive/30" 
              : "bg-accent/20 border-accent text-accent hover:bg-accent/30"
            }
          `}
        >
          {isMuted ? <VolumeX className="h-8 w-8" /> : <Volume2 className="h-8 w-8" />}
        </Button>
      </div>
    </main>
  );
};

export default Index;
