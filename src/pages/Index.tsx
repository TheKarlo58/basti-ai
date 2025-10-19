import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AudioRecorder } from "@/utils/audioRecorder";
import { AudioPlayer } from "@/utils/audioPlayer";
import { Volume2, VolumeX } from "lucide-react";

type RecordingState = "idle" | "recording";

const Index = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMuted, setIsMuted] = useState(false);
  const [webhookUrl] = useState("https://meine-n8n-domain.de/webhook/audio-input");
  const { toast } = useToast();
  
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Initialize audio player
    audioPlayerRef.current = new AudioPlayer();

    return () => {
      clearInterval(timer);
      audioRecorderRef.current?.stop();
      audioPlayerRef.current?.stop();
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const handleAudioChunk = async (wavBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', wavBlob, 'audio.wav');

      const response = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.audio) {
          // Add audio response to playback queue
          audioPlayerRef.current?.addChunk(data.audio);
        }
      }
    } catch (error) {
      console.error("Error sending audio chunk:", error);
    }
  };

  const handleRecordingError = (error: Error) => {
    console.error("Recording error:", error);
    setRecordingState("idle");
    
    if (error.message.includes('Permission denied') || error.name === 'NotAllowedError') {
      toast({
        title: "Microphone Access Denied",
        description: "Please allow microphone access to use voice features",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Recording Error",
        description: "Failed to access microphone",
        variant: "destructive",
      });
    }
  };

  const toggleRecording = async () => {
    if (recordingState === "recording") {
      // Stop recording
      audioRecorderRef.current?.stop();
      audioRecorderRef.current = null;
      setRecordingState("idle");
      toast({
        title: "Stopped",
        description: "Recording ended",
      });
    } else {
      // Start recording - show access request notification
      const { dismiss } = toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access to use this feature",
        duration: 10000,
      });

      audioRecorderRef.current = new AudioRecorder(
        handleAudioChunk,
        handleRecordingError
      );
      
      try {
        await audioRecorderRef.current.start();
        dismiss(); // Hide the access request notification
        setRecordingState("recording");
        toast({
          title: "Recording",
          description: "Listening to Basti...",
        });
      } catch (error) {
        dismiss(); // Hide the access request notification
        handleRecordingError(error as Error);
      }
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    audioPlayerRef.current?.setMuted(newMutedState);
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
