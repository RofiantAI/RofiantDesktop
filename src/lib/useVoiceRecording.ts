import { useEffect, useRef, useState } from "react";
import { transcribeAudio } from "./groq";

const SEGMENT_MS = 3000;

// Records in 3s segments and transcribes each as it completes, rather than
// waiting for the whole recording to end — keeps perceived latency low for
// long dictation. The final segment's transcribeSegment call chains after
// every prior one via transcribeChainRef so segments land in order.
export function useVoiceRecording(accessToken: string | null, onTranscript: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const transcribeChainRef = useRef<Promise<void>>(Promise.resolve());
  const segmentTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) stopRecording();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function transcribeSegment(blob: Blob, mimeType: string, isFinal: boolean) {
    if (blob.size === 0) return;
    if (!accessToken) return;
    if (isFinal) setIsTranscribing(true);
    try {
      const base64 = await blobToBase64(blob);
      const text = await transcribeAudio(base64, mimeType, accessToken);
      if (text) onTranscript(text);
    } catch (err) {
      const message =
        typeof err === "string" ? err : err instanceof Error ? err.message : "Transcription failed";
      console.error("transcribe failed", err);
      setVoiceError(message);
    } finally {
      if (isFinal) setIsTranscribing(false);
    }
  }

  function runSegment() {
    const stream = streamRef.current;
    if (!stream || !isRecordingRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const isFinal = !isRecordingRef.current;
      if (!isFinal) runSegment();
      const blob = new Blob(chunks, { type: mimeType });
      transcribeChainRef.current = transcribeChainRef.current.then(() =>
        transcribeSegment(blob, mimeType, isFinal),
      );
      if (isFinal) {
        void transcribeChainRef.current.then(() => {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        });
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    segmentTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, SEGMENT_MS);
  }

  async function startRecording() {
    setVoiceError(null);
    if (!accessToken) {
      setVoiceError("Sign in to use voice input");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isRecordingRef.current = true;
      transcribeChainRef.current = Promise.resolve();
      setIsRecording(true);
      runSegment();
    } catch {
      setVoiceError("Microphone access denied");
    }
  }

  function stopRecording() {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (segmentTimeoutRef.current !== null) {
      window.clearTimeout(segmentTimeoutRef.current);
      segmentTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  }

  function toggleRecording() {
    if (isRecording) stopRecording();
    else void startRecording();
  }

  return { isRecording, isTranscribing, voiceError, setVoiceError, toggleRecording };
}
