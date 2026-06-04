import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import { DrawingEngine } from '../modules/drawingEngine';
import { StrokeManager } from '../modules/strokeManager';
import { InteractionEngine } from '../modules/interactionEngine';
import { TransformEngine } from '../modules/transformEngine';
import { ShapeRecognizer } from '../modules/shapeRecognizer';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DrawingCanvas = forwardRef(({
  settings, gesture, landmark,
  controlGesture, controlLandmark, controlPinchDelta, controlAngleDelta
}, ref) => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const managerRef = useRef(null);
  const interactionRef = useRef(null);
  const transformRef = useRef(null);

  // Current in-progress path
  const currentPathRef = useRef(null);
  const lastPointRef = useRef(null);

  // Track control gesture for rendering
  const controlGestureRef = useRef('CTRL_IDLE');

  // settingsRef to avoid stale closures in render loops
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Three.js References (3D Mode)
  const threeContainerRef = useRef(null);
  const threeSceneRef = useRef(null);
  const threeCameraRef = useRef(null);
  const threeRendererRef = useRef(null);
  const threeControlsRef = useRef(null);
  const threeStrokesGroupRef = useRef(null);

  // WebSocket Collaboration (Phase 7)
  const wsRef = useRef(null);
  const remoteStrokesRef = useRef({});
  const [remoteCursors, setRemoteCursors] = useState({});

  useImperativeHandle(ref, () => ({
    clear: () => {
      managerRef.current?.clear();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'clear_canvas' }));
      }
    },
    undo: () => {
      managerRef.current?.undo();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'undo_stroke' }));
      }
    },
    redo: () => {
      managerRef.current?.redo();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'redo_stroke' }));
      }
    },
    save: () => engineRef.current?.saveAsImage(),
    getStrokes: () => managerRef.current ? managerRef.current.getAllStrokes() : [],
  }));

  const updateThreeStrokes = () => {
    const group = threeStrokesGroupRef.current;
    if (!group || !managerRef.current) return;

    // Clear old 3D elements
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    const strokes = managerRef.current.getAllStrokes();
    const allStrokes = [...strokes];
    if (currentPathRef.current) {
      allStrokes.push(currentPathRef.current);
    }
    Object.values(remoteStrokesRef.current).forEach((rs) => {
      allStrokes.push(rs);
    });

    allStrokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length < 2) return;

      const threePoints = [];
      stroke.points.forEach((p) => {
        // Center the 2D coordinate space relative to viewport middle
        const x3D = p.x - window.innerWidth / 2;
        const y3D = window.innerHeight / 2 - p.y;

        // Scale the normalized MediaPipe Z depth
        const z3D = p.z !== undefined ? -p.z * 1000 : 0;

        threePoints.push(new THREE.Vector3(x3D, y3D, z3D));
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(threePoints);
      const color = new THREE.Color(stroke.color || '#00ffff');

      // Create neon-like thick line representation
      const material = new THREE.LineBasicMaterial({
        color: color,
        linewidth: stroke.lineWidth || 3,
        transparent: true,
        opacity: stroke.brushType === 'watercolor' ? 0.45 : (stroke.brushType === 'pencil' ? 0.6 : 0.95)
      });

      const line = new THREE.Line(geometry, material);
      group.add(line);
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    managerRef.current = new StrokeManager();
    interactionRef.current = new InteractionEngine(managerRef.current);
    transformRef.current = new TransformEngine(managerRef.current);
    engineRef.current = new DrawingEngine(canvas);

    let animationFrameId;
    const renderLoop = () => {
      const mode = settingsRef.current?.mode || '2d';
      if (mode === '3d') {
        updateThreeStrokes();
      } else if (engineRef.current && managerRef.current) {
        const selectedId = transformRef.current?.getSelectedStrokeId()
          ?? interactionRef.current?.getSelectedStrokeId()
          ?? null;

        const localStrokes = managerRef.current.getAllStrokes();
        const remoteInProgressStrokes = Object.values(remoteStrokesRef.current);

        engineRef.current.draw(
          localStrokes.concat(remoteInProgressStrokes),
          currentPathRef.current,
          selectedId,
          controlGestureRef.current
        );
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Three.js Scene Setup & Loop (3D Mode)
  useEffect(() => {
    if (settings.mode !== '3d' || !threeContainerRef.current) return;

    const container = threeContainerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d); // glass dark background

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    camera.position.set(0, 0, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 3D Grid helper for orientation
    const gridHelper = new THREE.GridHelper(1000, 40, 0x00ffff, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(1, 1, 1).normalize();
    scene.add(dirLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const strokesGroup = new THREE.Group();
    scene.add(strokesGroup);

    threeSceneRef.current = scene;
    threeCameraRef.current = camera;
    threeRendererRef.current = renderer;
    threeControlsRef.current = controls;
    threeStrokesGroupRef.current = strokesGroup;

    let animationFrameId;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      threeRendererRef.current = null;
      threeSceneRef.current = null;
      threeCameraRef.current = null;
      threeControlsRef.current = null;
      threeStrokesGroupRef.current = null;
    };
  }, [settings.mode]);
  // WebSocket Collaboration Setup
  useEffect(() => {
    if (!settings.collabRoom) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // Dynamic WebSocket URL resolution for production/local flexibility
    const getWSUrl = () => {
      const envUrl = import.meta.env.VITE_WS_URL;
      if (envUrl) {
        // Strip trailing slash if present
        const cleanEnvUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
        return `${cleanEnvUrl}/ws/${settings.collabRoom}/${settings.clientId}`;
      }
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `${window.location.hostname}:8000`
        : window.location.host;
      return `${wsProtocol}//${wsHost}/ws/${settings.collabRoom}/${settings.clientId}`;
    };

    const ws = new WebSocket(getWSUrl());
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!managerRef.current) return;

        switch (msg.type) {
          case 'draw_point': {
            const sender = msg.senderId;
            if (!remoteStrokesRef.current[sender]) {
              remoteStrokesRef.current[sender] = {
                points: [msg.point],
                color: msg.color,
                lineWidth: msg.lineWidth,
                glowIntensity: msg.glowIntensity,
                brushType: msg.brushType
              };
            } else {
              remoteStrokesRef.current[sender].points.push(msg.point);
            }
            break;
          }

          case 'save_stroke': {
            const sender = msg.senderId;
            const stroke = remoteStrokesRef.current[sender];
            if (stroke) {
              managerRef.current.addStroke(
                stroke.points,
                stroke.color,
                stroke.lineWidth,
                stroke.glowIntensity,
                stroke.brushType,
                msg.shapeType
              );
              delete remoteStrokesRef.current[sender];
            }
            break;
          }

          case 'clear_canvas':
            managerRef.current.clear();
            break;

          case 'undo_stroke':
            managerRef.current.undo();
            break;

          case 'redo_stroke':
            managerRef.current.redo();
            break;

          case 'cursor_move':
            setRemoteCursors(prev => ({
              ...prev,
              [msg.senderId]: { x: msg.x, y: msg.y, time: Date.now() }
            }));
            break;

          case 'peer_leave':
            setRemoteCursors(prev => {
              const next = { ...prev };
              delete next[msg.clientId];
              return next;
            });
            delete remoteStrokesRef.current[msg.clientId];
            break;
        }
      } catch (err) {
        console.error("Collab message error:", err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [settings.collabRoom, settings.clientId]);

  // Clean stale remote cursors
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        let changed = false;
        const next = { ...prev };
        for (const id in next) {
          if (now - next[id].time > 5000) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const saveCurrentPath = () => {
    if (currentPathRef.current) {
      // Run Shape Autocorrection (Phase 2)
      const recognized = ShapeRecognizer.recognize(currentPathRef.current.points);
      const pointsToSave = recognized ? recognized.points : currentPathRef.current.points;
      const shapeType = recognized ? recognized.type : null;

      managerRef.current.addStroke(
        pointsToSave,
        currentPathRef.current.color,
        currentPathRef.current.lineWidth,
        currentPathRef.current.glowIntensity,
        currentPathRef.current.brushType,
        shapeType
      );

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'save_stroke',
          shapeType: shapeType
        }));
      }

      currentPathRef.current = null;
      lastPointRef.current = null;
    }
  };

  // === PRIMARY HAND: Drawing gestures ===
  useEffect(() => {
    if (!landmark || !managerRef.current || !interactionRef.current) return;

    const x = (1 - landmark.x) * canvasRef.current.width;
    const y = landmark.y * canvasRef.current.height;

    // Broadcast cursor position
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor_move',
        x,
        y
      }));
    }

    switch (gesture) {
      case 'DRAW': {
        const now = Date.now();
        if (!currentPathRef.current) {
          const firstPoint = {
            x,
            y,
            z: landmark.z || 0,
            time: now,
            pressure: 0.5,
            velocity: 0,
          };
          currentPathRef.current = {
            points: [firstPoint],
            color: settings.color,
            lineWidth: settings.lineWidth,
            glowIntensity: settings.glowIntensity,
            brushType: settings.brushType,
          };
          lastPointRef.current = firstPoint;

          // Broadcast draw start
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'draw_point',
              point: firstPoint,
              color: settings.color,
              lineWidth: settings.lineWidth,
              glowIntensity: settings.glowIntensity,
              brushType: settings.brushType
            }));
          }
        } else {
          const smoothFactor = 0.15;
          const smoothedX = lastPointRef.current.x * smoothFactor + x * (1 - smoothFactor);
          const smoothedY = lastPointRef.current.y * smoothFactor + y * (1 - smoothFactor);

          const dt = now - lastPointRef.current.time;
          const dx = smoothedX - lastPointRef.current.x;
          const dy = smoothedY - lastPointRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const velocity = dt > 0 ? dist / dt : 0;

          // Estimate pressure: inverse to velocity
          const maxVelocity = 3.5;
          const rawPressure = 1.0 - Math.min(1.0, velocity / maxVelocity) * 0.75;
          const pressure = lastPointRef.current.pressure * 0.6 + rawPressure * 0.4;

          const newPoint = {
            x: smoothedX,
            y: smoothedY,
            z: landmark.z || 0,
            time: now,
            pressure,
            velocity,
          };

          currentPathRef.current.points.push(newPoint);
          lastPointRef.current = newPoint;

          // Broadcast draw point
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'draw_point',
              point: newPoint,
              color: settings.color,
              lineWidth: settings.lineWidth,
              glowIntensity: settings.glowIntensity,
              brushType: settings.brushType
            }));
          }
        }
        break;
      }

      case 'ERASE':
        saveCurrentPath();
        interactionRef.current.handleErase(x, y);
        break;

      case 'CLEAR':
        saveCurrentPath();
        managerRef.current.clear();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'clear_canvas' }));
        }
        break;

      default:
        saveCurrentPath();
        break;
    }
  }, [gesture, landmark, settings]);

  // === SECONDARY HAND: Control gestures (move/scale/rotate) ===
  useEffect(() => {
    if (!transformRef.current) return;
    controlGestureRef.current = controlGesture || 'CTRL_IDLE';

    if (!controlLandmark) {
      transformRef.current.releaseAll();
      return;
    }

    const x = (1 - controlLandmark.x) * canvasRef.current.width;
    const y = controlLandmark.y * canvasRef.current.height;

    switch (controlGesture) {
      case 'CTRL_MOVE':
        transformRef.current.handleMove(x, y);
        break;

      case 'CTRL_SCALE':
        // First, select nearest if not already selected
        transformRef.current.selectNearest(x, y);
        transformRef.current.handleScale(controlPinchDelta || 0);
        break;

      case 'CTRL_ROTATE':
        transformRef.current.selectNearest(x, y);
        transformRef.current.handleRotate(controlAngleDelta || 0);
        break;

      default:
        transformRef.current.releaseAll();
        break;
    }
  }, [controlGesture, controlLandmark, controlPinchDelta, controlAngleDelta]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: settings.mode === '3d' ? 'none' : 'block',
          pointerEvents: 'none',
        }}
      />
      <div
        ref={threeContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: settings.mode === '3d' ? 'block' : 'none',
          pointerEvents: 'auto',
        }}
      />
      {/* Remote cursors display */}
      {Object.entries(remoteCursors).map(([id, cursor]) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            left: cursor.x,
            top: cursor.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 35,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#ff0055',
            boxShadow: '0 0 8px #ff0055',
          }} />
          <span style={{
            fontSize: '9px',
            backgroundColor: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            whiteSpace: 'nowrap',
          }}>
            {id}
          </span>
        </div>
      ))}
    </div>
  );
});

export default DrawingCanvas;
