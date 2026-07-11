"use client";

/**
 * Camera + MediaPipe HandLandmarker capture hook.
 *
 * Runs entirely in-browser. While recording, every video frame's hand
 * landmarks are pushed into a buffer; stopRecording() returns the captured
 * frame sequence for segmentation + classification.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CapturedFrame, Landmark } from "./features";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export function useHandCapture(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [handsVisible, setHandsVisible] = useState(false);

  const landmarkerRef = useRef<import("@mediapipe/tasks-vision").HandLandmarker | null>(null);
  const framesRef = useRef<CapturedFrame[]>([]);
  const recordingRef = useRef(false);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Init camera + model.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        const landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);
        loop();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Camera/model init failed");
      }
    }

    function loop() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (video && landmarker && video.readyState >= 2) {
        const t = performance.now();
        const result = landmarker.detectForVideo(video, t);
        let left: Landmark[] | null = null;
        let right: Landmark[] | null = null;
        result.landmarks.forEach((lms, i) => {
          const label = result.handedness[i]?.[0]?.categoryName;
          const hand = lms.map((p) => ({ x: p.x, y: p.y, z: p.z }));
          // Video is mirrored for the user; MediaPipe labels are from image POV.
          if (label === "Left") right = hand;
          else left = hand;
        });
        setHandsVisible(!!(left || right));
        if (recordingRef.current) {
          framesRef.current.push({ t, left, right });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    init();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(() => {
    framesRef.current = [];
    recordingRef.current = true;
    setRecording(true);
  }, []);

  const stopRecording = useCallback((): CapturedFrame[] => {
    recordingRef.current = false;
    setRecording(false);
    return framesRef.current;
  }, []);

  return { ready, error, recording, handsVisible, startRecording, stopRecording };
}
