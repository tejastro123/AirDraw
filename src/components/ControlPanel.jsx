import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette,
  Settings,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Eye,
  EyeOff,
  Zap,
  HelpCircle,
  Sigma,
  GitFork,
  Users,
  Sliders
} from 'lucide-react';
import { MathSolver } from '../modules/mathSolver';
import { DiagramBuilder } from '../modules/diagramBuilder';

const COLORS = [
  '#00ffff', // Neon Cyan
  '#ff00ff', // Neon Pink
  '#ffff00', // Neon Yellow
  '#00ff00', // Neon Green
  '#ff0000', // Neon Red
  '#ffffff', // Pure White
];

// Helper components for dynamic LaTeX rendering
const KatexRenderer = ({ tex }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current && tex) {
      if (window.katex) {
        try {
          window.katex.render(tex, containerRef.current, {
            throwOnError: false,
            displayMode: true
          });
        } catch (e) {
          containerRef.current.textContent = tex;
        }
      } else {
        containerRef.current.textContent = `Plain: ${tex}`;
      }
    }
  }, [tex]);
  return <div ref={containerRef} style={{ padding: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', minHeight: '40px', color: '#00f6ff', overflowX: 'auto' }} />;
};

// Helper components for dynamic Mermaid rendering
const MermaidRenderer = ({ code }) => {
  const [svg, setSvg] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!code) return;
    if (window.mermaid) {
      setIsError(false);
      try {
        const id = `mermaid-${Math.floor(Math.random() * 1000000)}`;
        window.mermaid.render(id, code).then(({ svg }) => {
          setSvg(svg);
        }).catch(err => {
          console.error("Mermaid render error:", err);
          setIsError(true);
        });
      } catch (e) {
        console.error(e);
        setIsError(true);
      }
    } else {
      setIsError(true);
    }
  }, [code]);

  if (isError && !window.mermaid) {
    return <p style={{ fontSize: '11px', color: '#f87171', padding: '10px', background: 'rgba(255,0,0,0.05)', borderRadius: '6px' }}>⚠️ Mermaid.js not loaded. Connect to the internet to render diagrams.</p>;
  }

  if (isError) {
    return <p style={{ fontSize: '11px', color: '#f87171', padding: '10px', background: 'rgba(255,0,0,0.05)', borderRadius: '6px' }}>⚠️ Failed to render flowchart. Check syntax.</p>;
  }

  return (
    <div
      dangerouslySetInnerHTML={{ __html: svg || '<p style="font-size:11px;color:rgba(255,255,255,0.4)">Generating layout...</p>' }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        padding: '10px',
        borderRadius: '8px',
        overflowX: 'auto',
        marginTop: '12px',
        maxHeight: '200px'
      }}
    />
  );
};

const ControlPanel = ({
  settings,
  onSettingsChange,
  onClear,
  onUndo,
  onRedo,
  onSave,
  onToggleCamera,
  cameraVisible,
  gestureVisible,
  onToggleGestures,
  onHelp,
  canvasRef // Pass ref to query strokes
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('canvas'); // 'canvas', 'math', 'diagram', 'collab', 'gestures'

  // Math OCR State
  const [ocrText, setOcrText] = useState('2 + 2');
  const [ocrStatus, setOcrStatus] = useState('Idle');
  const [mathResult, setMathResult] = useState('2 + 2 = 4');

  // Diagram state
  const [diagramCode, setDiagramCode] = useState('');

  // Collaboration State
  const [roomInput, setRoomInput] = useState('');

  // Customizable Gesture Map State (Phase 10)
  const [gestureMappings, setGestureMappings] = useState({
    DRAW: 'Index Point',
    ERASE: 'Fist Close',
    CLEAR: 'Open Palm Sweep',
    UNDO: 'Swipe Left',
    REDO: 'Swipe Right',
  });

  // Run Tesseract OCR on canvas image
  const handleOcrScan = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    if (!window.Tesseract) {
      alert("Tesseract.js OCR library is still loading...");
      return;
    }

    setOcrStatus('Scanning...');
    window.Tesseract.recognize(canvas, 'eng')
      .then(({ data: { text } }) => {
        const cleaned = text.trim();
        setOcrText(cleaned || 'No text detected');
        setOcrStatus('Idle');
        if (cleaned) {
          const solved = MathSolver.solve(cleaned);
          setMathResult(solved.latex);
        }
      })
      .catch((err) => {
        console.error(err);
        setOcrStatus('Scan Failed');
      });
  };

  const handleMathSolve = () => {
    const solved = MathSolver.solve(ocrText);
    setMathResult(solved.latex);
  };

  const handleGenerateDiagram = () => {
    if (!canvasRef?.current) return;
    const strokes = canvasRef.current.getStrokes();
    const code = DiagramBuilder.generate(strokes);
    setDiagramCode(code);
  };

  const handleCollabConnect = () => {
    if (roomInput.trim()) {
      onSettingsChange({ collabRoom: roomInput.trim() });
    }
  };

  const handleCollabDisconnect = () => {
    onSettingsChange({ collabRoom: '' });
    setRoomInput('');
  };

  return (
    <div className="control-panel-wrapper" style={{
      position: 'fixed',
      right: '24px',
      top: '24px',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      alignItems: 'flex-end',
    }}>
      <motion.button
        className="glass-meta"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <Settings size={22} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="glass-meta control-panel-body"
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            style={{
              borderRadius: '24px',
              padding: '20px',
              width: '320px',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              marginTop: '12px',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            {/* Tabs Selector Navigation */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '4px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              padding: '4px',
              borderRadius: '12px',
            }}>
              {[
                { id: 'canvas', icon: <Palette size={16} />, label: 'Canvas' },
                { id: 'math', icon: <Sigma size={16} />, label: 'Math' },
                { id: 'diagram', icon: <GitFork size={16} />, label: 'Flow' },
                { id: 'collab', icon: <Users size={16} />, label: 'Collab' },
                { id: 'gestures', icon: <Sliders size={16} />, label: 'Gestures' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  title={t.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeTab === t.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                    color: activeTab === t.id ? '#00f3ff' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {t.icon}
                </button>
              ))}
            </div>

            {/* TAB CONTENTS */}
            {activeTab === 'canvas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 2D/3D Mode Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                    Canvas Render Dimension
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => onSettingsChange({ mode: '2d' })}
                      style={{
                        padding: '8px',
                        borderRadius: '10px',
                        background: settings.mode === '2d' ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: settings.mode === '2d' ? '1px solid #00f3ff' : '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      🖥️ 2D Canvas
                    </button>
                    <button
                      onClick={() => onSettingsChange({ mode: '3d' })}
                      style={{
                        padding: '8px',
                        borderRadius: '10px',
                        background: settings.mode === '3d' ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: settings.mode === '3d' ? '1px solid #00f3ff' : '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      📦 3D Spatial
                    </button>
                  </div>
                </div>

                {/* Drawing Interaction Mode */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                    Drawing Interaction Mode
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => onSettingsChange({ interactionMode: 'camera' })}
                      style={{
                        padding: '8px',
                        borderRadius: '10px',
                        background: settings.interactionMode === 'camera' ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: settings.interactionMode === 'camera' ? '1px solid #00f3ff' : '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      🖐️ Gesture Mode
                    </button>
                    <button
                      onClick={() => onSettingsChange({ interactionMode: 'touch' })}
                      style={{
                        padding: '8px',
                        borderRadius: '10px',
                        background: settings.interactionMode === 'touch' ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: settings.interactionMode === 'touch' ? '1px solid #00f3ff' : '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      👆 Touch Mode
                    </button>
                  </div>
                </div>

                {/* Color Palette */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)' }}>
                    Color Palette
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
                    {COLORS.map((c) => (
                      <motion.div
                        key={c}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onSettingsChange({ color: c })}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '8px',
                          backgroundColor: c,
                          cursor: 'pointer',
                          border: settings.color === c ? '2px solid #fff' : 'none',
                          boxShadow: settings.color === c ? `0 0 15px ${c}` : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Brush Selector */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)' }}>
                    Brush Engine
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                    {[
                      { id: 'pen', label: '🖋️ Pen' },
                      { id: 'pencil', label: '✏️ Pencil' },
                      { id: 'marker', label: '🖍️ Marker' },
                      { id: 'calligraphy', label: '✒️ Calligraphy' },
                      { id: 'neon', label: '✨ Neon' },
                      { id: 'watercolor', label: '🎨 Watercolor' },
                      { id: 'spray', label: '💨 Spray' }
                    ].map((brush) => (
                      <button
                        key={brush.id}
                        onClick={() => onSettingsChange({ brushType: brush.id })}
                        style={{
                          borderRadius: '8px',
                          padding: '6px 8px',
                          color: '#fff',
                          backgroundColor: settings.brushType === brush.id ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                          border: settings.brushType === brush.id ? `1px solid ${settings.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          textAlign: 'left',
                        }}
                      >
                        {brush.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                      Brush Thickness: {settings.lineWidth}px
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={settings.lineWidth}
                      onChange={(e) => onSettingsChange({ lineWidth: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: settings.color }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                      Glow Intensity: {settings.glowIntensity}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={settings.glowIntensity}
                      onChange={(e) => onSettingsChange({ glowIntensity: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: settings.color }}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'math' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                  AI Handwriting OCR & Math Solver
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                    Recognized Text / Formula
                  </label>
                  <textarea
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    style={{
                      width: '100%',
                      height: '60px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                      padding: '8px',
                      resize: 'none',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    onClick={handleOcrScan}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#ff007f',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    📷 Scan Canvas
                  </button>
                  <button
                    onClick={handleMathSolve}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#00c3ff',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🧮 Solve Math
                  </button>
                </div>

                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                  Status: {ocrStatus}
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                    KaTeX Math Output
                  </div>
                  <KatexRenderer tex={mathResult} />
                </div>
              </div>
            )}

            {activeTab === 'diagram' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                  UML Flowchart Builder (Mermaid)
                </div>

                <button
                  onClick={handleGenerateDiagram}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#00f3ff',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#0a0f1d',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  📊 Generate Diagram from Canvas
                </button>

                {diagramCode && (
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                      Mermaid Diagram Preview
                    </label>
                    <MermaidRenderer code={diagramCode} />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'collab' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                  Real-time Workspace Collaboration
                </div>

                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                  User ID: <span style={{ color: '#00f3ff' }}>{settings.clientId}</span>
                </div>

                {!settings.collabRoom ? (
                  <>
                    <input
                      type="text"
                      placeholder="Enter Room Name..."
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      onClick={handleCollabConnect}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#10b981',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Join Room
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{
                      padding: '8px',
                      background: 'rgba(16,185,129,0.15)',
                      border: '1px solid #10b981',
                      borderRadius: '8px',
                      fontSize: '11px',
                      textAlign: 'center',
                    }}>
                      🟢 Connected to: <strong>{settings.collabRoom}</strong>
                    </div>
                    <button
                      onClick={handleCollabDisconnect}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#ef4444',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'gestures' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                  Customizable Gesture Map
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(gestureMappings).map(([action, gesture]) => (
                    <div
                      key={action}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{action}</span>
                      <select
                        value={gesture}
                        onChange={(e) => setGestureMappings(prev => ({
                          ...prev,
                          [action]: e.target.value
                        }))}
                        style={{
                          background: '#0f172a',
                          color: '#00f3ff',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '4px',
                          fontSize: '10px',
                          padding: '2px 4px',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="Index Point">☝️ Index Point</option>
                        <option value="Fist Close">✊ Fist Close</option>
                        <option value="Open Palm Sweep">🖐️ Open Palm Sweep</option>
                        <option value="Swipe Left">👈 Swipe Left</option>
                        <option value="Swipe Right">👉 Swipe Right</option>
                        <option value="Victory V">✌️ Victory V</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
              <ActionButton icon={<Undo2 size={15} />} label="Undo" onClick={onUndo} />
              <ActionButton icon={<Redo2 size={15} />} label="Redo" onClick={onRedo} />
              <ActionButton icon={<Trash2 size={15} />} label="Clear" onClick={onClear} />
              <ActionButton icon={<Download size={15} />} label="Save" onClick={onSave} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <ActionButton
                icon={cameraVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                label={cameraVisible ? "Hide Cam" : "Show Cam"}
                onClick={onToggleCamera}
              />
              <ActionButton
                icon={<Zap size={15} />}
                label={gestureVisible ? "Gestures On" : "Gestures Off"}
                onClick={onToggleGestures}
                active={gestureVisible}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ActionButton = ({ icon, label, onClick, active = false }) => (
  <motion.button
    className="glass-meta"
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    style={{
      borderRadius: '8px',
      padding: '8px',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '3px',
      cursor: 'pointer',
      fontSize: '9px',
      transition: 'all 0.2s',
      boxShadow: active ? '0 0 10px rgba(0, 243, 255, 0.4)' : 'none',
      border: active ? '1px solid rgba(0, 243, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
      background: 'rgba(255,255,255,0.03)',
    }}
  >
    {icon}
    {label}
  </motion.button>
);

export default ControlPanel;
