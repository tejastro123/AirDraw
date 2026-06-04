import React, { useRef, useEffect, useState } from 'react';
import { HandTracker } from '../modules/handTracking';

const CameraView = ({ onResults }) => {
  const videoRef = useRef(null);
  const trackerRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animationFrameId = null;
    let isActive = true;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Webcam access is not supported in this browser environment.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
        });
        
        if (!isActive) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().catch(e => console.warn("Video play interrupted:", e));
          startTracking();
        };
      } catch (err) {
        console.error('Error accessing camera:', err);
        setErrorMsg(`Camera Access Failed: ${err.message || 'Unknown camera issue'}`);
      }
    };

    const startTracking = () => {
      try {
        trackerRef.current = new HandTracker(onResults);
      } catch (e) {
        console.error("Hand tracker initialization error:", e);
        setErrorMsg("Failed to initialize gesture recognition. Ensure you are connected to the internet and CDN resources have loaded.");
        return;
      }
      
      const processFrame = async () => {
        if (!isActive) return;
        if (video.readyState === 4 && trackerRef.current) {
          try {
            await trackerRef.current.send(video);
          } catch (err) {
            console.error("Frame processing error:", err);
          }
        }
        animationFrameId = requestAnimationFrame(processFrame);
      };
      
      processFrame();
    };

    startCamera();

    return () => {
      isActive = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (video && video.srcObject && typeof video.srcObject.getTracks === 'function') {
        const tracks = video.srcObject.getTracks();
        if (Array.isArray(tracks)) {
          tracks.forEach(track => track.stop());
        }
      }
    };
  }, [onResults]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      zIndex: -1,
      backgroundColor: '#000',
    }}>
      {errorMsg ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '24px',
          color: '#ef4444',
          textAlign: 'center',
          background: '#090d16',
          fontFamily: "'Outfit', sans-serif"
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px',
          }}>⚠️</div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            maxWidth: '500px',
            color: '#fff',
            marginBottom: '12px',
          }}>
            {errorMsg}
          </div>
          <div style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.4)',
            maxWidth: '400px',
            lineHeight: 1.6
          }}>
            Please grant camera permissions, check your connection status, and try reloading the app.
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // Mirror effect
            filter: 'brightness(1)', // Clear camera view
          }}
          playsInline
        />
      )}
    </div>
  );
};

export default CameraView;
